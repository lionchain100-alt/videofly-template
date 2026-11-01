import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { TextTaskDetail } from "@/components/admin/text-task-detail";
import { getAdminTask, taskLabels } from "@/lib/admin/queries";
import {
  SectionTitle,
  Panel,
  StatusBadge,
  adminPath,
  formatDate,
  adminStyles as s,
} from "@/components/admin/management";

export const dynamic = "force-dynamic";
export default async function TaskDetail({
  params,
}: { params: Promise<{ locale: string; uuid: string }> }) {
  await requireAdmin();
  const { locale, uuid } = await params;
  const textTask = await TextTaskDetail({id:uuid,locale});
  if (textTask) return textTask;
  const row = await getAdminTask(uuid);
  if (!row) notFound();
  const task = row.task;
  return (
    <>
      <Link className={s.back} href={adminPath(locale, "/tasks")}>
        ← 任务列表
      </Link>
      <SectionTitle title="任务详情" description={task.uuid} />
      <Panel title="任务信息">
        <dl className={s.description}>
          <dt>用户</dt>
          <dd>
            <Link href={adminPath(locale, `/users/${encodeURIComponent(task.userId)}`)}>
              {row.email || task.userId}
            </Link>
          </dd>
          <dt>任务类型</dt>
          <dd>视频生成</dd>
          <dt>状态</dt>
          <dd>
            <StatusBadge
              tone={
                task.status === "FAILED" ? "bad" : task.status === "COMPLETED" ? "good" : "warn"
              }
            >
              {taskLabels[task.status]}
            </StatusBadge>
            {task.isDeleted && " · 用户已删除"}
          </dd>
          <dt>模型 / 供应商</dt>
          <dd>
            {task.model} / {task.provider || "未提交"}
          </dd>
          <dt>外部任务号</dt>
          <dd>{task.externalTaskId || "—"}</dd>
          <dt>任务计费</dt>
          <dd>{task.creditsUsed} 积分（实际结算请核对关联流水）</dd>
          <dt>创建时间</dt>
          <dd>{formatDate(task.createdAt)}</dd>
          <dt>最后更新</dt>
          <dd>{formatDate(task.updatedAt)}</dd>
          <dt>完成时间</dt>
          <dd>{formatDate(task.completedAt)}</dd>
          <dt>提示词</dt>
          <dd>{task.prompt}</dd>
          <dt>参数快照</dt>
          <dd>
            <pre>{JSON.stringify(task.parameters || {}, null, 2)}</pre>
          </dd>
          <dt>错误信息</dt>
          <dd>{task.errorMessage || "—"}</dd>
          <dt>结果地址</dt>
          <dd>{task.videoUrl || "尚无已转存结果"}</dd>
        </dl>
        <div className={s.detailLinks}>
          <Link href={`${adminPath(locale, "/credits")}?q=${encodeURIComponent(task.uuid)}`}>
            查询关联流水 →
          </Link>
          <Link href={`${adminPath(locale, "/tasks")}?userId=${encodeURIComponent(task.userId)}`}>
            该用户的全部任务 →
          </Link>
        </div>
      </Panel>
      <p className={s.notice}>
        本页为只读核对入口，不会重新提交收费模型任务。任务恢复、重试与完整结算状态机按后续阶段实施。
      </p>
    </>
  );
}
