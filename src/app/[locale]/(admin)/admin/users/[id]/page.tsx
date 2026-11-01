import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import {
  actionLabels,
  getAdminUser,
  listAdminLedger,
  listAdminTasks,
  taskLabels,
  userAudit,
} from "@/lib/admin/queries";
import { UserActions } from "@/components/admin/user-actions";
import {
  SectionTitle,
  Panel,
  DataTable,
  EmptyState,
  StatusBadge,
  adminPath,
  formatDate,
  adminStyles as s,
} from "@/components/admin/management";

export const dynamic = "force-dynamic";
export default async function UserDetail({
  params,
}: { params: Promise<{ locale: string; id: string }> }) {
  await requireAdmin();
  const { locale, id } = await params;
  const user = await getAdminUser(id);
  if (!user) notFound();
  const [tasks, ledger, audit] = await Promise.all([
    listAdminTasks({ userId: id }),
    listAdminLedger({ userId: id }),
    userAudit(id),
  ]);
  return (
    <>
      <Link className={s.back} href={adminPath(locale, "/users")}>
        ← 用户管理
      </Link>
      <SectionTitle title={user.name || "用户详情"} description={user.email}>
        <UserActions user={user} locale={locale} />
      </SectionTitle>
      <div className={s.stats}>
        {[
          ["可用积分", user.available],
          ["冻结积分", user.frozen],
          ["历史任务", user.taskCount],
        ].map(([label, value]) => (
          <div className={s.stat} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <Panel title="账号资料">
        <dl className={s.description}>
          <dt>用户 ID</dt>
          <dd>
            <code>{user.id}</code>
          </dd>
          <dt>权限</dt>
          <dd>{user.isAdmin ? "管理员" : "普通用户"}</dd>
          <dt>状态</dt>
          <dd>
            <StatusBadge tone={user.disabled ? "bad" : "good"}>
              {user.disabled ? "已停用" : "正常"}
            </StatusBadge>
          </dd>
          <dt>邮箱验证</dt>
          <dd>{user.emailVerified ? "已验证" : "未验证"}</dd>
          <dt>注册时间</dt>
          <dd>{formatDate(user.createdAt)}</dd>
          {user.disabled && (
            <>
              <dt>停用原因</dt>
              <dd>{user.disabledReason}</dd>
              <dt>停用时间</dt>
              <dd>{formatDate(user.disabledAt)}</dd>
            </>
          )}
        </dl>
        <div className={s.detailLinks}>
          <Link href={`${adminPath(locale, "/tasks")}?userId=${encodeURIComponent(id)}`}>
            查看全部任务（{tasks.total}）→
          </Link>
          <Link href={`${adminPath(locale, "/credits")}?userId=${encodeURIComponent(id)}`}>
            查看全部流水（{ledger.total}）→
          </Link>
        </div>
      </Panel>
      <Panel title="最近任务">
        {tasks.rows.length ? (
          <DataTable headings={["任务编号", "模型", "状态", "任务计费", "时间"]}>
            {tasks.rows.slice(0, 5).map((task) => (
              <tr key={task.uuid}>
                <td>
                  <Link href={adminPath(locale, `/tasks/${encodeURIComponent(task.uuid)}`)}>
                    <code>{task.uuid}</code>
                  </Link>
                </td>
                <td>{task.model}</td>
                <td>{taskLabels[task.status]}</td>
                <td>{task.creditsUsed}</td>
                <td>{formatDate(task.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState>此用户尚无真实生成任务。</EmptyState>
        )}
      </Panel>
      <Panel title="最近积分变动">
        {ledger.rows.length ? (
          <DataTable headings={["流水号", "变动", "当时可用", "原因", "时间"]}>
            {ledger.rows.slice(0, 5).map((entry) => (
              <tr key={entry.id}>
                <td>
                  <code>{entry.transNo}</code>
                </td>
                <td className={entry.credits > 0 ? s.positive : ""}>
                  {entry.credits > 0 ? "+" : ""}
                  {entry.credits}
                </td>
                <td>{entry.balanceAfter}</td>
                <td className={s.wrap}>{entry.remark}</td>
                <td>{formatDate(entry.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState />
        )}
      </Panel>
      <Panel title="最近管理操作">
        {audit.length ? (
          audit.map((item) => (
            <div className={s.auditItem} key={item.id}>
              <div>
                <strong>
                  {actionLabels[item.action] || item.action}
                  {item.credits ? ` · +${item.credits} 积分` : ""}
                </strong>
                <small>{formatDate(item.createdAt)}</small>
              </div>
              <p>{item.reason}</p>
              <small>
                操作者：{item.actorEmail} · 请求编号：{item.requestId}
              </small>
            </div>
          ))
        ) : (
          <EmptyState>尚无管理操作记录。旧版初始化记录可在积分流水查看。</EmptyState>
        )}
      </Panel>
    </>
  );
}
