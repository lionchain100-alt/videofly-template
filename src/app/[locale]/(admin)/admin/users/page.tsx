import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminUsers, param, type Params } from "@/lib/admin/queries";
import { UserActions } from "@/components/admin/user-actions";
import {
  SectionTitle,
  Panel,
  Filter,
  DataTable,
  EmptyState,
  Pagination,
  StatusBadge,
  adminPath,
  formatDate,
  adminStyles as s,
} from "@/components/admin/management";

export const dynamic = "force-dynamic";
export default async function UsersPage({
  params,
  searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Params> }) {
  await requireAdmin();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const data = await listAdminUsers(query);
  return (
    <>
      <SectionTitle
        title="用户管理"
        description="查看余额和历史记录，发放积分，管理账号使用状态。"
      />
      <Panel>
        <form method="get" className={s.filters}>
          <Filter name="q" label="搜索邮箱、姓名或用户 ID" defaultValue={param(query, "q")} />
          <Filter name="role" label="角色" defaultValue={param(query, "role")}>
            <option value="">全部角色</option>
            <option value="admin">管理员</option>
            <option value="user">普通用户</option>
          </Filter>
          <Filter name="status" label="账号状态" defaultValue={param(query, "status")}>
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </Filter>
          <button type="submit" className={s.primary}>
            搜索
          </button>
          <Link className={s.textButton} href={adminPath(locale, "/users")}>
            重置
          </Link>
        </form>
      </Panel>
      <Panel title="用户列表">
        {data.rows.length ? (
          <DataTable
            headings={[
              "用户 / 邮箱",
              "可用积分",
              "冻结积分",
              "任务数",
              "角色 / 状态",
              "注册时间",
              "操作",
            ]}
          >
            {data.rows.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link href={adminPath(locale, `/users/${encodeURIComponent(user.id)}`)}>
                    <strong>{user.name || "未设置"}</strong>
                    <small>{user.email}</small>
                  </Link>
                </td>
                <td className={s.number}>{user.available}</td>
                <td>{user.frozen}</td>
                <td>
                  <Link
                    href={`${adminPath(locale, "/tasks")}?userId=${encodeURIComponent(user.id)}`}
                  >
                    {user.taskCount}
                  </Link>
                </td>
                <td>
                  <StatusBadge>{user.isAdmin ? "管理员" : "普通用户"}</StatusBadge>
                  <small>
                    <StatusBadge tone={user.disabled ? "bad" : "good"}>
                      {user.disabled ? "已停用" : "正常"}
                    </StatusBadge>
                  </small>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <UserActions user={user} locale={locale} />
                  <small>
                    <Link href={adminPath(locale, `/users/${encodeURIComponent(user.id)}`)}>
                      详情与记录 →
                    </Link>
                  </small>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState />
        )}
        <Pagination params={query} {...data} />
      </Panel>
      <p className={s.pageNote}>
        可用积分排除过期和非有效积分包；冻结积分单独列出。停用普通账号将撤销会话并阻止后续使用。管理员账号不允许从此处停用。
      </p>
    </>
  );
}
