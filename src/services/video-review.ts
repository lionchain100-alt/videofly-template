import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, users, tasks, videoJobs, videoReviews, taskAttempts } from "@/db";
import { queryKieVideo, videoConfig } from "@/ai/kie-video";
import { finishTask } from "./tasks";
import { noteAiProviderReceipt } from "./ai-governance";
import { ApiError } from "@/lib/api/error";
export const videoReviewSchema = z
  .object({
    requestId: z.string().uuid(),
    taskId: z.string().uuid(),
    action: z.enum(["LINK_TASK", "CONFIRM_FAILURE", "RETRY_STORAGE"]),
    reason: z.string().trim().min(12).max(300),
    providerTaskId: z.string().trim().min(1).max(200).optional(),
    acknowledgeNoResult: z.boolean().optional(),
  })
  .strict();
export async function reviewVideo(
  actorId: string,
  input: z.infer<typeof videoReviewSchema>,
) {
  const [hint] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.id, input.taskId), eq(tasks.toolId, "video-generation")),
    )
    .limit(1);
  if (!hint) throw new ApiError("视频任务不存在", 404);
  let linked: Awaited<ReturnType<typeof queryKieVideo>> | null = null;
  if (input.action === "LINK_TASK") {
    if (!input.providerTaskId) throw new ApiError("请填写 Kie 任务编号", 400);
    try {
      linked = await queryKieVideo(input.providerTaskId, videoConfig());
    } catch {
      throw new ApiError(
        "暂时无法核验该 Kie 任务，请确认凭据、编号后重试",
        409,
      );
    }
    if (
      linked.model !== hint.model ||
      linked.prompt !== (hint.input as { prompt: string }).prompt
    )
      throw new ApiError(
        "Kie 任务的模型或原提示词与本任务不匹配，不能关联",
        409,
      );
  }
  return db.transaction(async (tx) => {
    const people = await tx
      .select()
      .from(users)
      .where(inArray(users.id, [...new Set([actorId, hint.userId])]))
      .orderBy(asc(users.id))
      .for("update");
    const actor = people.find((u) => u.id === actorId);
    if (!actor?.isAdmin || !actor.emailVerified || actor.disabled)
      throw new ApiError("管理员权限已失效", 403);
    const [receipt] = await tx
      .select()
      .from(videoReviews)
      .where(eq(videoReviews.requestId, input.requestId));
    if (receipt) {
      if (
        receipt.actorId !== actorId ||
        receipt.taskId !== input.taskId ||
        receipt.action !== input.action ||
        receipt.reason !== input.reason ||
        receipt.providerTaskId !== (input.providerTaskId || null)
      )
        throw new ApiError("请求编号已用于另一操作", 409);
      return { replayed: true };
    }
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, input.taskId))
      .for("update");
    const [job] = await tx
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.taskId, input.taskId))
      .for("update");
    if (
      !task ||
      !job ||
      task.status !== "RUNNING" ||
      job.stage !== "RECONCILING"
    )
      throw new ApiError("当前任务不是待核实状态，请刷新后查看", 409);
    if (
      input.action === "CONFIRM_FAILURE" &&
      (job.sourceUrl || !input.acknowledgeNoResult)
    )
      throw new ApiError(
        "只有核实未产出结果的任务可释放积分；已有成功结果请重试保存",
        409,
      );
    if (input.action === "RETRY_STORAGE" && !job.sourceUrl)
      throw new ApiError("当前没有可重试保存的结果地址", 409);
    await tx.insert(videoReviews).values({
      requestId: input.requestId,
      taskId: task.id,
      actorId,
      action: input.action,
      reason: input.reason,
      providerTaskId: input.providerTaskId || null,
    });
    if (input.action === "CONFIRM_FAILURE") {
      const applied = await finishTask(
        task.id,
        task.leaseToken,
        {
          errorCode: "ADMIN_CONFIRMED_FAILURE",
          errorMessage: `管理员核实未产出结果：${input.reason}`,
          actorUserId: actorId,
        },
        async (context) => {
          await context
            .update(videoJobs)
            .set({
              stage: "DONE",
              leaseUntil: null,
              lastError: "管理员已核实失败并释放积分",
            })
            .where(eq(videoJobs.taskId, task.id));
        },
        tx,
      );
      if (!applied) throw new ApiError("任务已变化，请刷新", 409);
    } else {
      await noteAiProviderReceipt(tx, task.id);
      const externalId =
        input.action === "LINK_TASK"
          ? input.providerTaskId!
          : job.providerTaskId;
      await tx
        .update(videoJobs)
        .set({
          stage: input.action === "RETRY_STORAGE" ? "STORING" : "POLLING",
          providerTaskId: externalId,
          storageAttempts: 0,
          pollAttempts: 0,
          nextRunAt: new Date(),
          leaseUntil: null,
          leaseToken: null,
          deadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          lastError: null,
        })
        .where(eq(videoJobs.taskId, task.id));
      await tx
        .update(tasks)
        .set({
          leaseToken: null,
          leaseUntil: null,
          errorCode: null,
          errorMessage: null,
          providerRequestId: externalId,
        })
        .where(eq(tasks.id, task.id));
      await tx
        .update(taskAttempts)
        .set({
          status: "RUNNING",
          errorCode: null,
          providerRequestId: externalId,
        })
        .where(eq(taskAttempts.taskId, task.id));
    }
    return { replayed: false };
  });
}
