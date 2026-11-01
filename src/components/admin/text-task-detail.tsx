import Link from "next/link";
import { VideoReviewActions } from "./video-review-actions";
import { db, tasks, creditHolds, taskAttempts, videoJobs, videoReviews } from "@/db";
import { eq } from "drizzle-orm";
import { Panel, SectionTitle, adminPath, formatDate, adminStyles as s } from "./management";
import { taskLabels } from "@/lib/admin/queries";

export async function TextTaskDetail({ id, locale }: { id: string; locale: string }) {
  const [row] = await db
    .select({ task: tasks, hold: creditHolds, attempt: taskAttempts })
    .from(tasks)
    .leftJoin(creditHolds, eq(creditHolds.taskId, tasks.id))
    .leftJoin(taskAttempts, eq(taskAttempts.taskId, tasks.id))
    .where(eq(tasks.id, id))
    .limit(1);
  if (!row) return null;
  const task = row.task;
  const isVideo = task.toolId === "video-generation";
  const [job] = isVideo ? await db.select().from(videoJobs).where(eq(videoJobs.taskId, id)) : [];
  const reviews = isVideo
    ? await db.select().from(videoReviews).where(eq(videoReviews.taskId, id))
    : [];
  return (
    <>
      <Link className={s.back} href={adminPath(locale, "/tasks")}>
        ← 任务列表
      </Link>
      <SectionTitle
        title={isVideo ? "视频生成任务详情" : "文本摘要任务详情"}
        description={task.id}
      />
      <Panel title="任务与结算">
        <dl className={s.description}>
          <dt>用户</dt>
          <dd>
            <Link href={adminPath(locale, `/users/${task.userId}`)}>{task.userId}</Link>
          </dd>
          <dt>状态</dt>
          <dd>{taskLabels[task.status]}</dd>
          <dt>供应商 / 模型</dt>
          <dd>
            {task.provider} / {task.model}
          </dd>
          <dt>积分</dt>
          <dd>
            {task.credits} 积分 · {row.hold?.status || "无冻结记录"}
          </dd>
          <dt>请求编号</dt>
          <dd>{task.requestId}</dd>
          <dt>创建 / 开始</dt>
          <dd>
            {formatDate(task.createdAt)} / {formatDate(task.startedAt)}
          </dd>
          <dt>完成时间</dt>
          <dd>{formatDate(task.finishedAt)}</dd>
          <dt>输入快照</dt>
          <dd>
            <pre>{JSON.stringify(task.input, null, 2)}</pre>
          </dd>
          <dt>结果</dt>
          <dd>
            {isVideo && task.status === "SUCCEEDED" ? (
              <video
                controls
                preload="metadata"
                style={{ width: "100%", maxWidth: 640 }}
                src={`/api/v1/tools/video/tasks/${task.id}/file`}
              />
            ) : (
              task.result || "尚无成功结果"
            )}
          </dd>
          <dt>错误</dt>
          <dd>
            {task.errorCode} {task.errorMessage || "—"}
          </dd>
          <dt>供应商请求号</dt>
          <dd>{task.providerRequestId || "—"}</dd>
          {job && (
            <>
              <dt>视频阶段</dt>
              <dd>{job.stage}</dd>
              <dt>查询 / 保存次数</dt>
              <dd>
                {job.pollAttempts} / {job.storageAttempts}
              </dd>
              <dt>调度提示</dt>
              <dd>{job.lastError || "—"}</dd>
            </>
          )}
          <dt>{isVideo ? "供应商用量（如有）" : "Token 用量"}</dt>
          <dd>
            <pre>{JSON.stringify(task.usage || {}, null, 2)}</pre>
          </dd>
          <dt>执行记录</dt>
          <dd>
            {row.attempt?.status || "尚未执行"} · {row.attempt?.id || "—"}
          </dd>
          <dt>积分分配</dt>
          <dd>
            <pre>{JSON.stringify(row.hold?.packageAllocation || [], null, 2)}</pre>
          </dd>
        </dl>
        <div className={s.detailLinks}>
          <Link href={`${adminPath(locale, "/credits")}?q=${task.id}`}>
            查看冻结 / 结算 / 释放流水 →
          </Link>
        </div>
      </Panel>
      {job?.stage === "RECONCILING" && (
        <Panel title="待核实任务处理">
          <VideoReviewActions taskId={id} hasResult={!!job.sourceUrl} />
        </Panel>
      )}
      {reviews.length > 0 && (
        <Panel title="核实操作记录">
          {reviews.map((v) => (
            <div className={s.auditItem} key={v.requestId}>
              <strong>{v.action}</strong>
              <p>{v.reason}</p>
              <small>
                操作者：{v.actorId} · 请求：{v.requestId} · {formatDate(v.createdAt)}
              </small>
            </div>
          ))}
        </Panel>
      )}
      <p className={s.notice}>
        {isVideo
          ? "明确失败释放积分；响应不确定时保留冻结并待核实；已有成功结果仅重试保存，不重新生成。"
          : "失败释放原冻结积分，保留原到期时间。中断任务不会自动重新生成。"}
      </p>
    </>
  );
}
