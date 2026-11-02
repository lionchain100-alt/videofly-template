import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  users,
  tasks,
  taskAttempts,
  creditPackages,
  creditHolds,
  creditTransactions,
} from "@/db";
import { ApiError } from "@/lib/api/error";
import {
  executionSnapshot,
  snapshotHash,
  textProviderConfig,
  TextProviderError,
} from "@/ai/text-provider";
import {
  summarySubmissionSchema,
  type SummaryTask,
} from "@/tools/text-summary/contract";
import type { z } from "zod";
import { assertToolEnabled } from "@/config/site-server";
import {
  planAiTask,
  reserveAiCost,
  finishAiCost,
  recordAiDenial,
} from "./ai-governance";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof tasks.$inferSelect;
type Allocation = { packageId: number; credits: number };
async function available(tx: Tx, userId: string) {
  const [row] = await tx
    .select({
      value:
        sql<number>`coalesce(sum(${creditPackages.remainingCredits}),0)`.mapWith(
          Number,
        ),
    })
    .from(creditPackages)
    .where(
      and(
        eq(creditPackages.userId, userId),
        eq(creditPackages.status, "ACTIVE"),
        or(
          isNull(creditPackages.expiredAt),
          gt(creditPackages.expiredAt, new Date()),
        ),
      ),
    );
  return row.value;
}
export async function submitSummary(
  userId: string,
  submission: z.infer<typeof summarySubmissionSchema>,
) {
  return reserveToolTask(
    userId,
    submission.requestId,
    submission.input,
    "text-summary",
    () => {
      try {
        const config = textProviderConfig();
        return { ...config, executionConfig: executionSnapshot(config) };
      } catch (e) {
        if (e instanceof TextProviderError) throw new ApiError(e.message, 503);
        throw e;
      }
    },
    undefined,
    submission.policyRevision,
  );
}
export async function reserveToolTask(
  userId: string,
  requestId: string,
  input: unknown,
  toolId: string,
  resolveConfig: () => {
    provider: string;
    model: string;
    credits: number;
    executionConfig: unknown;
  },
  onCreated?: (tx: Tx, id: string) => Promise<void>,
  expectedRevision?: number,
) {
  const hash = snapshotHash(input);
  if (toolId === "text-summary" || toolId === "video-generation")
    await assertToolEnabled(toolId);
  return db
    .transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!owner || owner.disabled)
        throw new ApiError("账号不可用，请重新登录", 401);
      const [existing] = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.requestId, requestId)))
        .limit(1);
      if (existing) {
        if (existing.inputHash !== hash || existing.toolId !== toolId)
          throw new ApiError("同一请求编号不可更改输入", 409);
        return { id: existing.id, replayed: true };
      }
      const { assertRefundUsageAllowed } = await import("./refunds");
      await assertRefundUsageAllowed(tx, userId);
      const { config, usage } = await planAiTask(
        tx,
        userId,
        toolId,
        input,
        resolveConfig(),
        expectedRevision,
      );
      const [active] = await tx
        .select({ value: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            inArray(tasks.status, ["QUEUED", "RUNNING"]),
          ),
        );
      if (active.value >= 3)
        throw new ApiError(
          "最多同时执行 3 个工具任务，请等待现有任务完成",
          429,
        );
      const packages = await tx
        .select()
        .from(creditPackages)
        .where(
          and(
            eq(creditPackages.userId, userId),
            eq(creditPackages.status, "ACTIVE"),
            gt(creditPackages.remainingCredits, 0),
            or(
              isNull(creditPackages.expiredAt),
              gt(creditPackages.expiredAt, new Date()),
            ),
          ),
        )
        .orderBy(
          sql`${creditPackages.expiredAt} is null`,
          asc(creditPackages.expiredAt),
          asc(creditPackages.id),
        )
        .for("update");
      if (packages.reduce((n, p) => n + p.remainingCredits, 0) < config.credits)
        throw new ApiError("积分不足，请先补充积分", 402);
      const id = randomUUID();
      const allocation: Allocation[] = [];
      await tx.insert(tasks).values({
        id,
        userId,
        requestId: requestId,
        inputHash: hash,
        toolId,
        input: input,
        provider: config.provider,
        model: config.model,
        executionConfig: config.executionConfig,
        credits: config.credits,
        queueDeadline: new Date(Date.now() + 10 * 60 * 1000),
      });
      await reserveAiCost(tx, id, userId, usage);
      let remaining = config.credits;
      for (const pkg of packages) {
        if (remaining === 0) break;
        const credits = Math.min(remaining, pkg.remainingCredits);
        remaining -= credits;
        allocation.push({ packageId: pkg.id, credits });
        await tx
          .update(creditPackages)
          .set({
            remainingCredits: sql`${creditPackages.remainingCredits}-${credits}`,
            frozenCredits: sql`${creditPackages.frozenCredits}+${credits}`,
            updatedAt: new Date(),
          })
          .where(eq(creditPackages.id, pkg.id));
      }
      const [hold] = await tx
        .insert(creditHolds)
        .values({
          userId,
          taskId: id,
          credits: config.credits,
          packageAllocation: allocation,
          status: "HOLDING",
        })
        .returning();
      await tx.insert(creditTransactions).values({
        transNo: `TXN_${randomUUID()}`,
        userId,
        taskId: id,
        transType: "TASK_HOLD",
        credits: -config.credits,
        balanceAfter: await available(tx, userId),
        holdId: hold.id,
        remark: `${toolId === "text-summary" ? "文本摘要" : "视频生成"}冻结 ${config.credits} 积分；成功后结算，失败释放`,
      });
      if (onCreated) await onCreated(tx, id);
      return { id, replayed: false };
    })
    .catch(async (error) => {
      await recordAiDenial(userId, requestId, error);
      throw error;
    });
}
export async function getSummaryTask(
  userId: string,
  id: string,
): Promise<SummaryTask | null> {
  const [row] = await db
    .select({ task: tasks, creditStatus: creditHolds.status })
    .from(tasks)
    .leftJoin(creditHolds, eq(creditHolds.taskId, tasks.id))
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.id, id),
        eq(tasks.toolId, "text-summary"),
      ),
    )
    .limit(1);
  if (!row) return null;
  return serializeTask(row.task, row.creditStatus);
}
function serializeTask(task: Task, creditStatus: string | null): SummaryTask {
  return {
    id: task.id,
    requestId: task.requestId,
    status: task.status as SummaryTask["status"],
    input: task.input as SummaryTask["input"],
    credits: task.credits,
    result: task.result,
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
    createdAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString() || null,
    creditStatus,
  };
}
export async function listSummaryTasks(userId: string) {
  const rows = await db
    .select({ task: tasks, creditStatus: creditHolds.status })
    .from(tasks)
    .leftJoin(creditHolds, eq(creditHolds.taskId, tasks.id))
    .where(and(eq(tasks.userId, userId), eq(tasks.toolId, "text-summary")))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(20);
  return rows.map((row) => serializeTask(row.task, row.creditStatus));
}
// Lock order: user -> task -> hold -> packages (same expiry/id ordering as submission).
export async function finishTask(
  id: string,
  leaseToken: string | null,
  outcome: {
    result?: string;
    providerRequestId?: string | null;
    usage?: unknown;
    errorCode?: string;
    errorMessage?: string;
    actorUserId?: string;
  },
  finalize?: (tx: Tx, task: Task) => Promise<void>,
  externalTx?: Tx,
) {
  const [hint] = await (externalTx || db)
    .select({ userId: tasks.userId })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!hint) return false;
  const apply = async (tx: Tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, hint.userId))
      .for("update");
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .for("update");
    if (
      !task ||
      !["RUNNING", "QUEUED"].includes(task.status) ||
      task.leaseToken !== leaseToken
    )
      return false;
    const [hold] = await tx
      .select()
      .from(creditHolds)
      .where(eq(creditHolds.taskId, id))
      .for("update");
    if (!hold || hold.status !== "HOLDING")
      throw new Error("Task credit invariant violated");
    const allocations = hold.packageAllocation as Allocation[];
    if (allocations.reduce((n, a) => n + a.credits, 0) !== task.credits)
      throw new Error("Task allocation invariant violated");
    if (outcome.result !== undefined && task.status !== "RUNNING")
      throw new Error("Only running tasks can succeed");
    const packages = await tx
      .select()
      .from(creditPackages)
      .where(
        inArray(
          creditPackages.id,
          allocations.map((a) => a.packageId),
        ),
      )
      .orderBy(
        sql`${creditPackages.expiredAt} is null`,
        asc(creditPackages.expiredAt),
        asc(creditPackages.id),
      )
      .for("update");
    const success = typeof outcome.result === "string";
    let released = 0;
    for (const pkg of packages) {
      const credits = allocations.find((a) => a.packageId === pkg.id)!.credits;
      if (pkg.frozenCredits < credits)
        throw new Error("Insufficient frozen credits");
      // Restore the original package, including its original expiry. Expired credits are never revived.
      if (
        !success &&
        pkg.status === "ACTIVE" &&
        (!pkg.expiredAt || pkg.expiredAt > new Date())
      )
        released += credits;
      await tx
        .update(creditPackages)
        .set({
          remainingCredits: sql`${creditPackages.remainingCredits}+${success ? 0 : credits}`,
          frozenCredits: sql`${creditPackages.frozenCredits}-${credits}`,
          updatedAt: new Date(),
        })
        .where(eq(creditPackages.id, pkg.id));
    }
    const now = new Date();
    await tx
      .update(creditHolds)
      .set({ status: success ? "SETTLED" : "RELEASED", settledAt: now })
      .where(eq(creditHolds.id, hold.id));
    await tx.insert(creditTransactions).values({
      transNo: `TXN_${randomUUID()}`,
      userId: task.userId,
      actorUserId: outcome.actorUserId || null,
      taskId: id,
      holdId: hold.id,
      transType: success ? "TASK_SETTLE" : "TASK_RELEASE",
      credits: success ? 0 : released,
      balanceAfter: await available(tx, task.userId),
      remark: success
        ? `${task.toolId === "text-summary" ? "文本摘要" : "视频生成"}完成，结算已冻结的 ${task.credits} 积分（不重复扣可用余额）`
        : `${task.toolId === "text-summary" ? "文本摘要" : "视频生成"}失败，释放 ${task.credits} 积分至原积分包；其中当前可用 ${released} 积分，保留原到期时间`,
    });
    await tx
      .update(tasks)
      .set({
        status: success ? "SUCCEEDED" : "FAILED",
        result: outcome.result || null,
        errorCode: outcome.errorCode || null,
        errorMessage: outcome.errorMessage || null,
        providerRequestId: outcome.providerRequestId || null,
        usage: outcome.usage || null,
        finishedAt: now,
        leaseUntil: null,
      })
      .where(eq(tasks.id, id));
    await tx
      .update(taskAttempts)
      .set({
        status: success ? "SUCCEEDED" : "FAILED",
        errorCode: outcome.errorCode || null,
        providerRequestId: outcome.providerRequestId || null,
        finishedAt: now,
      })
      .where(eq(taskAttempts.taskId, id));
    await finishAiCost(tx, id, success, outcome.usage);
    if (finalize) await finalize(tx, task);
    const { recoverRefundDebtForUser } = await import("./refunds");
    await recoverRefundDebtForUser(tx, task.userId);
    return true;
  };
  return externalTx ? apply(externalTx) : db.transaction(apply);
}
export async function claimTask(): Promise<Task | null> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "QUEUED"),
          gt(tasks.queueDeadline, new Date()),
          eq(tasks.toolId, "text-summary"),
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!task) return null;
    const config = task.executionConfig as { timeoutMs: number };
    const token = randomUUID();
    const [claimed] = await tx
      .update(tasks)
      .set({
        status: "RUNNING",
        startedAt: new Date(),
        leaseToken: token,
        leaseUntil: new Date(Date.now() + config.timeoutMs + 30000),
      })
      .where(eq(tasks.id, task.id))
      .returning();
    await tx
      .insert(taskAttempts)
      .values({ id: randomUUID(), taskId: task.id, status: "RUNNING" });
    return claimed;
  });
}
export async function recoverExpiredTasks() {
  const stale = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.toolId, "text-summary"),
        or(
          and(eq(tasks.status, "RUNNING"), lt(tasks.leaseUntil, new Date())),
          and(eq(tasks.status, "QUEUED"), lt(tasks.queueDeadline, new Date())),
        ),
      ),
    )
    .limit(50);
  for (const task of stale)
    await finishTask(task.id, task.leaseToken, {
      errorCode:
        task.status === "QUEUED" ? "QUEUE_TIMEOUT" : "WORKER_INTERRUPTED",
      errorMessage:
        "任务等待超时或执行进程中断，冻结积分已释放；未自动重复调用模型。",
    });
  return stale.length;
}
