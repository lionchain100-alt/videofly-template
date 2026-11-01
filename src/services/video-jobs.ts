import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  tasks,
  users,
  videoJobs,
  taskAssets,
  taskAttempts,
  creditHolds,
  videoReviews,
} from "@/db";
import { reserveToolTask, finishTask } from "./tasks";
import { snapshotHash } from "@/ai/text-provider";
import {
  videoConfig,
  videoSnapshot,
  submitKieVideo,
  queryKieVideo,
  VideoProviderError,
} from "@/ai/kie-video";
import { storeVideo } from "./video-assets";
import { ApiError } from "@/lib/api/error";
import type { VideoInput, LiveVideoTask } from "@/tools/video/contract";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Task = typeof tasks.$inferSelect;
type Job = typeof videoJobs.$inferSelect;
export async function submitVideo(userId: string, requestId: string, input: VideoInput) {
  return reserveToolTask(
    userId,
    requestId,
    input,
    "video-generation",
    () => {
      try {
        const c = videoConfig();
        return { ...c, executionConfig: videoSnapshot(c) };
      } catch (e) {
        if (e instanceof VideoProviderError) throw new ApiError(e.message, 503);
        throw e;
      }
    },
    async (tx, id) => {
      await tx.insert(videoJobs).values({
        taskId: id,
        provider: "kie",
        deadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
    },
  );
}
function present(task: Task, job: Job, creditStatus: string | null): LiveVideoTask {
  return {
    id: task.id,
    requestId: task.requestId,
    status: task.status,
    stage: job.stage,
    input: task.input as VideoInput,
    credits: task.credits,
    creditStatus,
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
    lastError: job.lastError,
    videoUrl: task.status === "SUCCEEDED" ? `/api/v1/tools/video/tasks/${task.id}/file` : null,
    createdAt: task.createdAt.toISOString(),
    providerTaskId: job.providerTaskId,
    model: task.model,
  };
}
export async function getVideoTask(userId: string, id: string) {
  const [row] = await db
    .select({ task: tasks, job: videoJobs, creditStatus: creditHolds.status })
    .from(tasks)
    .innerJoin(videoJobs, eq(videoJobs.taskId, tasks.id))
    .leftJoin(creditHolds, eq(creditHolds.taskId, tasks.id))
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId), eq(tasks.toolId, "video-generation")))
    .limit(1);
  return row ? present(row.task, row.job, row.creditStatus) : null;
}
export async function listVideoTasks(userId: string) {
  const rows = await db
    .select({ task: tasks, job: videoJobs, creditStatus: creditHolds.status })
    .from(tasks)
    .innerJoin(videoJobs, eq(videoJobs.taskId, tasks.id))
    .leftJoin(creditHolds, eq(creditHolds.taskId, tasks.id))
    .where(and(eq(tasks.userId, userId), eq(tasks.toolId, "video-generation")))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(20);
  return rows.map((r) => present(r.task, r.job, r.creditStatus));
}
async function owned(
  id: string,
  token: string,
  action: (tx: Tx, task: Task, job: Job) => Promise<void>,
) {
  const [hint] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, id));
  if (!hint) return false;
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, hint.userId)).for("update");
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
    const [job] = await tx.select().from(videoJobs).where(eq(videoJobs.taskId, id)).for("update");
    if (
      !task ||
      !job ||
      task.status !== "RUNNING" ||
      task.leaseToken !== token ||
      job.leaseToken !== token
    )
      return false;
    await action(tx, task, job);
    return true;
  });
}
async function park(id: string, token: string, code: string, message: string) {
  return owned(id, token, async (tx) => {
    await tx
      .update(videoJobs)
      .set({ stage: "RECONCILING", leaseUntil: null, lastError: message })
      .where(eq(videoJobs.taskId, id));
    await tx
      .update(tasks)
      .set({ errorCode: code, errorMessage: message, leaseUntil: null })
      .where(eq(tasks.id, id));
    await tx
      .update(taskAttempts)
      .set({ status: "RECONCILING", errorCode: code })
      .where(eq(taskAttempts.taskId, id));
  });
}
async function finishVideo(
  task: Task,
  token: string,
  outcome: Parameters<typeof finishTask>[2],
  asset?: Awaited<ReturnType<typeof storeVideo>>,
) {
  return finishTask(task.id, token, outcome, async (tx) => {
    if (asset)
      await tx.insert(taskAssets).values({ taskId: task.id, userId: task.userId, ...asset });
    await tx
      .update(videoJobs)
      .set({ stage: "DONE", leaseUntil: null, lastError: outcome.errorMessage || null })
      .where(eq(videoJobs.taskId, task.id));
  });
}
export async function claimVideoJob() {
  const due = await db
    .select({ id: videoJobs.taskId, userId: tasks.userId })
    .from(videoJobs)
    .innerJoin(tasks, eq(tasks.id, videoJobs.taskId))
    .where(
      and(
        inArray(tasks.status, ["QUEUED", "RUNNING"]),
        inArray(videoJobs.stage, ["QUEUED", "SUBMITTING", "POLLING", "STORING"]),
        lte(videoJobs.nextRunAt, new Date()),
        or(isNull(videoJobs.leaseUntil), lte(videoJobs.leaseUntil, new Date())),
      ),
    )
    .orderBy(asc(videoJobs.nextRunAt))
    .limit(10);
  for (const hint of due) {
    const claimed = await db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, hint.userId))
        .for("update", { skipLocked: true });
      if (!owner) return null;
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, hint.id)).for("update");
      const [job] = await tx
        .select()
        .from(videoJobs)
        .where(eq(videoJobs.taskId, hint.id))
        .for("update");
      if (
        !job ||
        !task ||
        !["QUEUED", "RUNNING"].includes(task.status) ||
        !["QUEUED", "SUBMITTING", "POLLING", "STORING"].includes(job.stage) ||
        job.nextRunAt > new Date() ||
        (job.leaseUntil && job.leaseUntil > new Date())
      )
        return null;
      const token = randomUUID();
      const until = new Date(Date.now() + 240000);
      const [updatedTask] = await tx
        .update(tasks)
        .set({
          status: "RUNNING",
          startedAt: task.startedAt || new Date(),
          leaseToken: token,
          leaseUntil: until,
        })
        .where(eq(tasks.id, task.id))
        .returning();
      const [updatedJob] = await tx
        .update(videoJobs)
        .set({
          leaseToken: token,
          leaseUntil: until,
          stage: job.stage === "QUEUED" ? "SUBMITTING" : job.stage,
        })
        .where(eq(videoJobs.taskId, task.id))
        .returning();
      await tx
        .insert(taskAttempts)
        .values({ id: randomUUID(), taskId: task.id, status: "RUNNING" })
        .onConflictDoNothing();
      return { task: updatedTask, job: updatedJob, previousStage: job.stage, token };
    });
    if (claimed) return claimed;
  }
  return null;
}
export async function processVideoJob(
  claim: NonNullable<Awaited<ReturnType<typeof claimVideoJob>>>,
) {
  const { task, job, token, previousStage } = claim;
  if (previousStage === "SUBMITTING")
    return park(
      task.id,
      token,
      "SUBMISSION_UNCONFIRMED",
      "上次提交进程中断，是否接单尚未确认；请在后台核实供应商任务，不会自动重发或释放积分。",
    );
  if (previousStage === "QUEUED" && task.queueDeadline < new Date())
    return finishVideo(task, token, {
      errorCode: "QUEUE_TIMEOUT",
      errorMessage: "任务排队超时，尚未调用供应商，冻结积分已释放。",
    });
  if (previousStage !== "STORING" && job.deadlineAt < new Date())
    return park(
      task.id,
      token,
      "POLLING_DEADLINE",
      "超过自动查询期限，请在后台核实供应商结果；冻结积分保留。",
    );
  if (previousStage === "STORING") {
    try {
      if (!job.sourceUrl) throw Error("No stored source");
      const asset = await storeVideo(task.id, job.sourceUrl);
      // Retrying persistence never repeats model submission or download of an already saved file.
      for (let retry = 0; retry < 3; retry++) {
        try {
          return await finishVideo(
            task,
            token,
            {
              result: JSON.stringify({ assetTaskId: task.id }),
              providerRequestId: job.providerTaskId,
            },
            asset,
          );
        } catch (e) {
          if (retry === 2) throw e;
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch {
      const attempt = job.storageAttempts + 1;
      if (attempt >= 5)
        return park(
          task.id,
          token,
          "STORAGE_REVIEW",
          "供应商已成功，但本地保存多次失败；请在后台重试保存，积分尚未结算，不会重新生成。",
        );
      return owned(task.id, token, async (tx) => {
        await tx
          .update(videoJobs)
          .set({
            storageAttempts: attempt,
            leaseUntil: null,
            nextRunAt: new Date(Date.now() + Math.min(300, 2 ** attempt) * 1000),
            lastError: "本地保存暂未成功，正在重试保存；不会重新生成。",
          })
          .where(eq(videoJobs.taskId, task.id));
      });
    }
  }
  let config: ReturnType<typeof videoConfig>;
  try {
    config = videoConfig();
    if (snapshotHash(videoSnapshot(config)) !== snapshotHash(task.executionConfig))
      throw new VideoProviderError("CONFIG_CHANGED", true, "供应商配置已变更。");
  } catch (e) {
    if (previousStage === "QUEUED")
      return finishVideo(task, token, {
        errorCode: "CONFIG_CHANGED",
        errorMessage: "执行配置不可用，尚未提交，已释放冻结积分。",
      });
    return park(
      task.id,
      token,
      "CONFIG_CHANGED",
      "已有供应商任务的配置不可用，请恢复正确凭据后核实；冻结积分保留。",
    );
  }
  if (previousStage === "QUEUED") {
    let externalId: string;
    try {
      externalId = await submitKieVideo(task.input as VideoInput, config);
    } catch (e) {
      if (e instanceof VideoProviderError && e.definite)
        return finishVideo(task, token, {
          errorCode: e.code,
          errorMessage: "Kie 明确拒绝创建视频任务，冻结积分已释放。",
        });
      return park(
        task.id,
        token,
        "SUBMISSION_UNCONFIRMED",
        "提交响应中断，供应商是否接单尚未确认。请核实后处理；不会自动重发或释放积分。",
      );
    }
    for (let retry = 0; retry < 3; retry++) {
      try {
        return await owned(task.id, token, async (tx) => {
          await tx
            .update(videoJobs)
            .set({
              stage: "POLLING",
              providerTaskId: externalId,
              nextRunAt: new Date(Date.now() + 3000),
              leaseUntil: null,
              lastError: null,
            })
            .where(eq(videoJobs.taskId, task.id));
          await tx
            .update(tasks)
            .set({ providerRequestId: externalId })
            .where(eq(tasks.id, task.id));
          await tx
            .update(taskAttempts)
            .set({ providerRequestId: externalId })
            .where(eq(taskAttempts.taskId, task.id));
        });
      } catch {
        if (retry === 2)
          console.error(
            `Video receipt needs reconciliation: task=${task.id} providerTask=${externalId}`,
          );
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return;
  }
  try {
    if (!job.providerTaskId)
      return park(task.id, token, "MISSING_TASK_ID", "供应商任务编号缺失，请核实。积分保留冻结。");
    const result = await queryKieVideo(job.providerTaskId, config);
    if (result.state === "failed")
      return finishVideo(task, token, {
        errorCode: "PROVIDER_FAILED",
        errorMessage: "供应商已确认视频生成失败，冻结积分已释放。",
        providerRequestId: job.providerTaskId,
      });
    return owned(task.id, token, async (tx) => {
      await tx
        .update(videoJobs)
        .set({
          stage: result.state === "success" ? "STORING" : "POLLING",
          sourceUrl: result.state === "success" ? result.url : null,
          pollAttempts: job.pollAttempts + 1,
          nextRunAt: new Date(
            Date.now() +
              (result.state === "success"
                ? 0
                : Math.min(30000, 3000 * 2 ** Math.min(job.pollAttempts, 4))),
          ),
          leaseUntil: null,
          lastError: null,
        })
        .where(eq(videoJobs.taskId, task.id));
    });
  } catch {
    return owned(task.id, token, async (tx) => {
      await tx
        .update(videoJobs)
        .set({
          pollAttempts: job.pollAttempts + 1,
          nextRunAt: new Date(Date.now() + 30000),
          leaseUntil: null,
          lastError: "暂时无法确认供应商状态，稍后自动重查；不会重新生成或提前退分。",
        })
        .where(eq(videoJobs.taskId, task.id));
    });
  }
}
