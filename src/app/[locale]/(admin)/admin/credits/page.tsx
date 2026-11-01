import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminLedger, ledgerLabels, param, type Params } from "@/lib/admin/queries";
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
export default async function CreditsPage({
  params,
  searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Params> }) {
  await requireAdmin();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const data = await listAdminLedger(query);
  return (
    <>
      <SectionTitle title="积分流水" description="按用户、来源、日期或请求编号核对积分变动。">
        <Link className={s.primary} href={adminPath(locale, "/users")}>
          去用户管理发积分
        </Link>
      </SectionTitle>
      <Panel>
        <form method="get" className={s.filters}>
          <Filter
            name="q"
            label="搜索邮箱、流水号、原因或请求编号"
            defaultValue={param(query, "q")}
          />
          <Filter name="userId" label="用户 ID" defaultValue={param(query, "userId")} />
          <Filter name="type" label="流水类型" defaultValue={param(query, "type")}>
            <option value="">全部类型</option>
            {Object.entries(ledgerLabels).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </Filter>
          <label className={s.filter}>
            <span>开始日期</span>
            <input type="date" name="from" defaultValue={param(query, "from")} />
          </label>
          <label className={s.filter}>
            <span>结束日期</span>
            <input type="date" name="to" defaultValue={param(query, "to")} />
          </label>
          <button type="submit" className={s.primary}>
            筛选
          </button>
          <Link className={s.textButton} href={adminPath(locale, "/credits")}>
            重置
          </Link>
        </form>
      </Panel>
      <p className={s.pageNote}>
        日期按北京时间筛选，结束日期包含当天。余额是记录发生时的可用余额快照；历史失败释放可能记为
        0。文本任务冻结减少可用余额，结算记录 0（不重复扣除），失败释放恢复可用余额；不等同于现金退款。流水仅供查询，不提供修改或删除。
      </p>
      <Panel title="流水记录">
        {data.rows.length ? (
          <DataTable
            headings={[
              "流水 / 用户",
              "类型",
              "积分变动",
              "当时可用",
              "来源与关联",
              "原因 / 操作者",
              "时间",
            ]}
          >
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <code>{row.transNo}</code>
                  <small>
                    <Link href={adminPath(locale, `/users/${encodeURIComponent(row.userId)}`)}>
                      {row.email || row.userId}
                    </Link>
                  </small>
                </td>
                <td>
                  <StatusBadge>{ledgerLabels[row.transType] || row.transType}</StatusBadge>
                </td>
                <td>
                  <span
                    className={`${s.number} ${row.credits > 0 ? s.positive : row.credits < 0 ? s.negative : ""}`}
                  >
                    {row.credits > 0 ? "+" : ""}
                    {row.credits}
                  </span>
                </td>
                <td className={s.number}>{row.balanceAfter}</td>
                <td className={s.metadata}>
                  {row.packageId && (
                    <small>
                      积分包 #{row.packageId} · 到期 {formatDate(row.expiresAt)}
                    </small>
                  )}
                  {row.orderNo && <small>来源：{row.orderNo}</small>}
                  {row.videoUuid && (
                    <small>
                      <Link href={adminPath(locale, `/tasks/${encodeURIComponent(row.videoUuid)}`)}>
                        任务：{row.videoUuid}
                      </Link>
                    </small>
                  )}
                  {row.taskId && <small><Link href={adminPath(locale, `/tasks/${row.taskId}`)}>摘要任务：{row.taskId}</Link></small>}
                  {row.holdId && <small>冻结记录 #{row.holdId}</small>}
                  {row.requestId && <small>请求：{row.requestId}</small>}
                  {row.operationId && <small>操作：{row.operationId}</small>}
                </td>
                <td className={s.metadata}>
                  {row.remark || "—"}
                  <small>
                    {row.actorEmail ? `管理员：${row.actorEmail}` : "系统 / 历史记录未记录操作者"}
                  </small>
                </td>
                <td>{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState />
        )}
        <Pagination params={query} {...data} />
      </Panel>
    </>
  );
}
