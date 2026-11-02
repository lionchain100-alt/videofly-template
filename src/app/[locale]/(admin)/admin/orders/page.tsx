import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, paymentOrders, paymentFulfillments, users } from "@/db";
import { requireAdmin } from "@/lib/auth/admin";
import {
  DataTable,
  EmptyState,
  Panel,
  Pagination,
  SectionTitle,
  adminPath,
  adminStyles as s,
  formatDate,
} from "@/components/admin/management";
import { param, type Params } from "@/lib/admin/queries";
export const dynamic = "force-dynamic";
export default async function OrdersPage({
  params,
  searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Params> }) {
  await requireAdmin();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const q = param(query, "q").slice(0, 128);
  const status = param(query, "status");
  const provider = param(query, "provider");
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const condition = and(
    q
      ? or(
          ilike(paymentOrders.id, pattern),
          ilike(users.email, pattern),
          ilike(paymentOrders.externalId, pattern),
          ilike(paymentOrders.userId, pattern),
          sql`exists(select 1 from payment_fulfillments f where f.order_id=${paymentOrders.id} and f.payment_id ilike ${pattern})`,
        )
      : undefined,
    ["CREATING", "PENDING", "PAID", "REVIEW"].includes(status)
      ? eq(paymentOrders.status, status)
      : undefined,
    ["paypal", "waffo", "stripe", "creem"].includes(provider)
      ? eq(paymentOrders.provider, provider)
      : undefined,
  );
  const [count] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(paymentOrders)
    .innerJoin(users, eq(users.id, paymentOrders.userId))
    .where(condition);
  const pages = Math.max(1, Math.ceil(count.n / 15));
  const page = Math.min(
    pages,
    Math.max(1, Number.parseInt(param(query, "page"), 10) || 1),
  );
  const rows = await db
    .select({
      order: paymentOrders,
      email: users.email,
      paymentId: paymentFulfillments.paymentId,
    })
    .from(paymentOrders)
    .innerJoin(users, eq(users.id, paymentOrders.userId))
    .leftJoin(
      paymentFulfillments,
      eq(paymentFulfillments.orderId, paymentOrders.id),
    )
    .where(condition)
    .orderBy(desc(paymentOrders.createdAt))
    .limit(15)
    .offset((page - 1) * 15);
  const labels: Record<string, string> = {
    CREATING: "创建中",
    PENDING: "待确认",
    PAID: "已到账 / 已发积分",
    REVIEW: "需核实",
  };
  return (
    <>
      <SectionTitle
        title="充值订单"
        description="收款与发积分记录。回跳页参数不会改变订单，未配置的支付通道保持关闭。"
      />
      <Panel>
        <form className={s.filters}>
          <label className={s.filter}>
            订单 / 邮箱
            <input name="q" defaultValue={q} />
          </label>
          <label className={s.filter}>
            通道
            <select name="provider" defaultValue={provider}>
              <option value="">全部</option>
              <option>paypal</option>
              <option>waffo</option>
              <option>stripe</option>
              <option>creem</option>
            </select>
          </label>
          <label className={s.filter}>
            状态
            <select name="status" defaultValue={status}>
              <option value="">全部</option>
              {Object.entries(labels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={s.primary}>
            查询
          </button>
        </form>
        {rows.length ? (
          <DataTable
            headings={[
              "订单 / 用户",
              "支付",
              "积分",
              "状态",
              "收款凭证",
              "创建时间",
            ]}
          >
            {rows.map(({ order: o, email, paymentId }) => (
              <tr key={o.id}>
                <td>
                  <Link
                    className="break-all underline"
                    href={adminPath(locale, `/orders/${o.id}`)}
                  >
                    {o.id} · 退款管理 →
                  </Link>
                  <Link href={adminPath(locale, `/users/${o.userId}`)}>
                    {email}
                  </Link>
                </td>
                <td>
                  {o.provider} / {o.environment}
                  <br />
                  {o.currency} {(o.amount / 100).toFixed(2)}
                  <br />
                  已退 {(o.refundedAmount / 100).toFixed(2)} · 待审核积分{" "}
                  {o.refundCreditShortfall}
                </td>
                <td>{o.credits}</td>
                <td>{labels[o.status]}</td>
                <td>
                  <div className="break-all">{paymentId || "—"}</div>
                  {o.status === "PAID" && (
                    <Link href={adminPath(locale, `/credits?q=${o.id}`)}>
                      查看入账流水 →
                    </Link>
                  )}
                </td>
                <td>{formatDate(o.createdAt)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState>暂无符合条件的充值订单</EmptyState>
        )}
        <Pagination params={query} page={page} pages={pages} total={count.n} />
      </Panel>
    </>
  );
}
