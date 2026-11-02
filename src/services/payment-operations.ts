import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  users,
  paymentOrders,
  paymentEvents,
  paymentFulfillments,
  paymentRefunds,
  paymentOperations,
} from "@/db";
import { ApiError } from "@/lib/api/error";
import { paymentConfig, queryCheckout } from "@/payment/providers/registry";
import { queryPaypal } from "@/payment/providers/paypal";
import { receivePaymentEvent } from "./orders";
import { recheckRefund } from "./refunds";
import type { VerifiedEvent, PaymentProvider } from "@/payment/providers/types";
const eventKey = z
  .object({
    provider: z.enum(["paypal", "waffo", "stripe", "creem"]),
    environment: z.enum(["sandbox", "test", "live"]),
    accountId: z.string().min(1).max(200),
    eventId: z.string().min(1).max(200),
  })
  .strict();
const common = {
  requestId: z.string().uuid(),
  reason: z.string().trim().min(12).max(300),
};
export const paymentOperationSchema = z.discriminatedUnion("action", [
  z
    .object({ ...common, action: z.literal("REPLAY_EVENT"), event: eventKey })
    .strict(),
  z
    .object({ ...common, action: z.literal("REVIEW_EVENT"), event: eventKey })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("RECONCILE_ORDER"),
      orderId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("RECHECK_REFUND"),
      refundId: z.string().uuid(),
    })
    .strict(),
]);
type Input = z.infer<typeof paymentOperationSchema>;
type EventKey = z.infer<typeof eventKey>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const scope = (key: EventKey) =>
  and(
    eq(paymentEvents.provider, key.provider),
    eq(paymentEvents.environment, key.environment),
    eq(paymentEvents.accountId, key.accountId),
    eq(paymentEvents.eventId, key.eventId),
  );
const safeOperation = ({
  requestHash,
  leaseToken,
  leaseUntil,
  ...row
}: typeof paymentOperations.$inferSelect) => row;
async function authorize(tx: Tx, actor: string) {
  const [u] = await tx
    .select()
    .from(users)
    .where(eq(users.id, actor))
    .for("update");
  if (!u || u.disabled || !u.isAdmin || !u.emailVerified)
    throw new ApiError("需要有效管理员权限", 403);
}
function savedEvent(row: typeof paymentEvents.$inferSelect): VerifiedEvent {
  const event = row.normalizedEvent as VerifiedEvent | null;
  if (
    !event ||
    event.id !== row.eventId ||
    event.provider !== row.provider ||
    event.environment !== row.environment ||
    event.accountId !== row.accountId ||
    !["VERIFIED", "PROCESSED", "IGNORED"].includes(row.status)
  )
    throw new ApiError(
      "记录不是可重放的已验证事件；不能上传或编辑支付事实",
      409,
    );
  if (!event.fact && !event.refund && !event.subscription)
    throw new ApiError(
      "该通知无可执行收款事实，请保留审核，不会据此发分或退款",
      409,
    );
  for (const fact of [event.fact, event.refund, event.subscription])
    if (
      fact &&
      (fact.provider !== event.provider ||
        fact.environment !== event.environment ||
        fact.accountId !== event.accountId)
    )
      throw new ApiError("保存事件的内外账户或环境不一致，禁止重放", 409);
  return event;
}
export async function paymentOperation(actor: string, rawInput: Input) {
  const input = paymentOperationSchema.parse(rawInput);
  const hash = createHash("sha256")
    .update(JSON.stringify({ actor, ...input }))
    .digest("hex");
  const row = await db.transaction(async (tx) => {
    await authorize(tx, actor);
    const [old] = await tx
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.requestId, input.requestId));
    if (old) {
      if (old.requestHash !== hash)
        throw new ApiError("操作编号不可变更原因、对象或动作", 409);
      return old;
    }
    let orderId: string | undefined;
    if ("event" in input) {
      const [e] = await tx
        .select()
        .from(paymentEvents)
        .where(scope(input.event));
      if (!e) throw new ApiError("事件不存在", 404);
      orderId = e.orderId || undefined;
    } else if ("orderId" in input) {
      const [o] = await tx
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, input.orderId));
      if (!o) throw new ApiError("订单不存在", 404);
      orderId = o.id;
    } else {
      const [r] = await tx
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, input.refundId));
      if (!r) throw new ApiError("退款不存在", 404);
      orderId = r.orderId;
    }
    const [r] = await tx
      .insert(paymentOperations)
      .values({
        id: randomUUID(),
        requestId: input.requestId,
        requestHash: hash,
        actorUserId: actor,
        action: input.action,
        reason: input.reason,
        target: input,
        orderId,
        status: "QUEUED",
      })
      .onConflictDoNothing({ target: paymentOperations.requestId })
      .returning();
    if (r) return r;
    const [duplicate] = await tx
      .select()
      .from(paymentOperations)
      .where(eq(paymentOperations.requestId, input.requestId));
    if (!duplicate || duplicate.requestHash !== hash)
      throw new ApiError("该操作编号属于另一项请求", 409);
    return duplicate;
  });
  return safeOperation(row);
}
export async function getPaymentOperation(requestId: string) {
  const [r] = await db
    .select()
    .from(paymentOperations)
    .where(eq(paymentOperations.requestId, requestId));
  if (!r) throw new ApiError("操作不存在", 404);
  return safeOperation(r);
}
async function reconcile(orderId: string) {
  const [o] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, orderId));
  if (!o) throw new ApiError("订单不存在", 404);
  const [receipt] = await db
    .select()
    .from(paymentFulfillments)
    .where(eq(paymentFulfillments.orderId, o.id));
  if (receipt)
    return {
      code: "ALREADY_FULFILLED",
      message: "该收款已履约；未新增积分，也未调用退款或扣款接口",
    };
  const events = await db
    .select()
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.provider, o.provider),
        eq(paymentEvents.environment, o.environment),
        eq(paymentEvents.accountId, o.accountId),
        or(
          eq(paymentEvents.orderId, o.id),
          sql`${paymentEvents.normalizedEvent}->'subscription'->>'checkoutOrderId' = ${o.id}`,
          sql`${paymentEvents.normalizedEvent}->'fact'->>'internalId' = ${o.id}`,
        ),
      ),
    )
    .orderBy(desc(paymentEvents.createdAt))
    .limit(100);
  for (const e of events) {
    const v = e.normalizedEvent as VerifiedEvent | null;
    if (v?.fact || v?.subscription?.payment) {
      if (v.fact && v.fact.internalId !== o.id)
        throw new ApiError("事件关联到另一订单，需人工核实", 409);
      await receivePaymentEvent(savedEvent(e), {
        queryOnly: true,
        reconcile: true,
      });
      const [done] = await db
        .select()
        .from(paymentFulfillments)
        .where(eq(paymentFulfillments.orderId, o.id));
      if (!done)
        throw new ApiError(
          "已验证事件尚未形成该订单履约，需核对账期或旧数据；没有直接补分",
          409,
        );
      return {
        code: "VERIFIED_EVENT_APPLIED",
        message: "已按保存的已验证实收事实补偿；按原快照幂等履约",
      };
    }
  }
  if (o.kind === "SUBSCRIPTION")
    throw new ApiError(
      "未找到该账期已验证实收事件，订阅 active 或 checkout 不能作为发分凭据",
      409,
    );
  const c = paymentConfig(o.provider as PaymentProvider);
  if (c.accountId !== o.accountId || c.environment !== o.environment)
    throw new ApiError("当前通道账户或环境不匹配原订单，未补发", 409);
  const snapshot = { ...o, provider: o.provider as PaymentProvider };
  const fact =
    o.provider === "paypal"
      ? await queryPaypal(snapshot, false)
      : await queryCheckout(snapshot);
  if (!fact)
    throw new ApiError(
      o.provider === "waffo"
        ? "Waffo 查询状态不构成实收凭据；请在平台重发官方通知，再重放已验签事件，禁止按商品快照补发"
        : "尚无已确认到账凭据；未发积分，不执行 capture 或新扣款",
      409,
    );
  await receivePaymentEvent(
    {
      id: `ADMIN_QUERY_${o.id}_${createHash("sha256").update(JSON.stringify(fact)).digest("hex").slice(0, 32)}`,
      type: "ADMIN.PAYMENT.QUERY",
      provider: fact.provider,
      environment: fact.environment,
      accountId: fact.accountId,
      internalId: o.id,
      externalId: fact.externalId,
      fact,
    },
    { queryOnly: true },
  );
  return {
    code: "QUERY_CONFIRMED",
    message: "服务端只读查单已确认实收，已幂等补偿；未调用扣款或退款接口",
  };
}
export async function processPaymentOperation(id?: string) {
  const token = randomUUID();
  const op = await db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(paymentOperations)
      .where(
        and(
          id ? eq(paymentOperations.id, id) : undefined,
          inArray(paymentOperations.status, ["QUEUED", "RUNNING"]),
          or(
            isNull(paymentOperations.leaseUntil),
            lt(paymentOperations.leaseUntil, new Date()),
          ),
        ),
      )
      .orderBy(asc(paymentOperations.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!r) return null;
    await tx
      .update(paymentOperations)
      .set({
        status: "RUNNING",
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 120000),
        attempts: sql`${paymentOperations.attempts}+1`,
        updatedAt: new Date(),
      })
      .where(eq(paymentOperations.id, r.id));
    return r;
  });
  if (!op) return false;
  let code = "COMPLETED";
  let message = "处理完成";
  let status = "SUCCEEDED";
  try {
    await db.transaction((tx) => authorize(tx, op.actorUserId));
    const input = paymentOperationSchema.parse(op.target);
    if (
      createHash("sha256")
        .update(JSON.stringify({ actor: op.actorUserId, ...input }))
        .digest("hex") !== op.requestHash
    )
      throw new ApiError("持久操作内容与原审计指纹不一致，停止执行", 409);
    if (input.action === "RECONCILE_ORDER") {
      const result = await reconcile(input.orderId);
      code = result.code;
      message = result.message;
    } else if (input.action === "RECHECK_REFUND") {
      await recheckRefund(op.actorUserId, input.refundId);
      code = "REFUND_QUERY_ONLY";
      message = "仅查询原退款；没有创建新退款或重复扣积分";
    } else {
      const [e] = await db
        .select()
        .from(paymentEvents)
        .where(scope(input.event));
      if (!e) throw new ApiError("事件不存在", 404);
      if (input.action === "REVIEW_EVENT") {
        await db
          .update(paymentEvents)
          .set({ reviewStatus: "ACKNOWLEDGED" })
          .where(scope(input.event));
        code = "REVIEW_RECORDED";
        message =
          "已记录审核确认；不改变平台收退款状态，也不增减积分。拒付或撤销仍需按平台账单人工处置";
      } else {
        await receivePaymentEvent(savedEvent(e), {
          queryOnly: true,
          reconcile: true,
        });
        code = "EVENT_REPLAYED";
        message =
          "已重放保存的已验证事实；履约和退款各自防重，不重新申请现金退款";
      }
    }
  } catch (e) {
    status = "NEEDS_REVIEW";
    code = e instanceof ApiError ? `REVIEW_${e.status}` : "RETRY_REVIEW";
    message =
      e instanceof ApiError
        ? e.message.slice(0, 300)
        : "处理未确认；保留已审计操作，请查询结果后用同编号核实，不要手动补分或重新退款";
  }
  await db
    .update(paymentOperations)
    .set({
      status,
      resultCode: code,
      message,
      leaseToken: null,
      leaseUntil: null,
      updatedAt: new Date(),
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(paymentOperations.id, op.id),
        eq(paymentOperations.leaseToken, token),
      ),
    );
  return true;
}
export const paymentOpsQuerySchema = z.object({
  view: z.enum(["orders", "events", "refunds", "operations"]).default("orders"),
  q: z.string().max(200).default(""),
  provider: z.enum(["", "paypal", "waffo", "stripe", "creem"]).default(""),
  exceptions: z.enum(["0", "1"]).default("1"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export async function listPaymentOperations(
  input: z.infer<typeof paymentOpsQuerySchema>,
) {
  const { view, q, provider, exceptions, page } = input;
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const p = provider || null;
  const ex = exceptions === "1";
  // SQL parameters are bound; only fixed view branches choose table/query structure.
  let rows: Record<string, any>[];
  if (view === "orders")
    rows = await db.execute(
      sql`select o.id,o.user_id,o.provider,o.environment,o.account_id,o.product_name,o.kind,o.amount,o.currency,o.credits,o.status,o.created_at,u.email,f.payment_id,f.package_id,o.refund_credit_shortfall,(select count(*)::int from payment_events e where e.order_id=o.id and (e.status='VERIFIED' or e.last_error is not null)) as pending_events from payment_orders o join "user" u on u.id=o.user_id left join payment_fulfillments f on f.order_id=o.id where (${p}::text is null or o.provider=${p}) and (${q}='' or o.id ilike ${like} or o.user_id ilike ${like} or u.email ilike ${like} or o.external_id ilike ${like} or f.payment_id ilike ${like} or exists(select 1 from payment_events e where e.order_id=o.id and (e.event_id ilike ${like} or e.normalized_event->'fact'->>'paymentId' ilike ${like}))) and (${!ex} or o.status in ('CREATING','PENDING','REVIEW') or (o.status='PAID' and f.order_id is null) or o.refund_credit_shortfall>0 or exists(select 1 from payment_events e where e.order_id=o.id and (e.status='VERIFIED' or e.last_error is not null))) order by o.created_at desc,o.id limit 16 offset ${(page - 1) * 15}`,
    );
  else if (view === "events")
    rows = await db.execute(
      sql`select e.provider,e.environment,e.account_id,e.event_id,e.event_type,e.order_id,e.status,e.attempt_count,e.last_attempt_at,e.last_error,e.review_status,e.created_at,e.processed_at,case when e.event_type='ADMIN.PAYMENT.QUERY' then 'SERVER_QUERY' else 'VERIFIED_WEBHOOK' end as source,e.normalized_event->'fact'->>'paymentId' as payment_id,e.normalized_event->'refund'->>'externalId' as refund_id from payment_events e where (${p}::text is null or e.provider=${p}) and (${q}='' or e.event_id ilike ${like} or e.order_id ilike ${like} or e.event_type ilike ${like} or e.normalized_event->'fact'->>'paymentId' ilike ${like} or e.normalized_event->'refund'->>'paymentId' ilike ${like} or exists(select 1 from payment_orders o join "user" u on u.id=o.user_id where o.id=e.order_id and (u.email ilike ${like} or o.user_id ilike ${like} or o.external_id ilike ${like}))) and (${!ex} or e.status='VERIFIED' or e.last_error is not null or (e.status='IGNORED' and e.review_status='OPEN') or (e.event_type ~* '(dispute|revers|chargeback)' and e.review_status='OPEN')) order by e.created_at desc,e.event_id limit 16 offset ${(page - 1) * 15}`,
    );
  else if (view === "refunds")
    rows = await db.execute(
      sql`select r.id,r.order_id,r.provider,r.environment,r.status,r.payment_id,r.external_id,r.amount,r.currency,r.reserved_credits,r.reclaimed_credits,r.last_error,r.created_at,u.email from payment_refunds r join payment_orders o on o.id=r.order_id join "user" u on u.id=o.user_id where (${p}::text is null or r.provider=${p}) and (${q}='' or r.id ilike ${like} or r.order_id ilike ${like} or r.payment_id ilike ${like} or r.external_id ilike ${like} or u.email ilike ${like} or o.user_id ilike ${like}) and (${!ex} or r.status in ('BLOCKED','REVIEW','QUEUED','SUBMITTING','PENDING') or o.refund_credit_shortfall>0) order by r.created_at desc,r.id limit 16 offset ${(page - 1) * 15}`,
    );
  else
    rows = await db.execute(
      sql`select p.id,p.request_id,p.actor_user_id,p.action,p.order_id,p.status,p.reason,p.result_code,p.message,p.attempts,p.created_at,p.updated_at,p.target->'event'->>'eventId' as event_id from payment_operations p where (${q}='' or p.request_id ilike ${like} or p.order_id ilike ${like} or p.actor_user_id ilike ${like} or p.target->'event'->>'eventId' ilike ${like}) and (${p}::text is null or exists(select 1 from payment_orders o where o.id=p.order_id and o.provider=${p}) or p.target->'event'->>'provider'=${p}) and (${!ex} or p.status in ('QUEUED','RUNNING','NEEDS_REVIEW')) order by p.created_at desc,p.id limit 16 offset ${(page - 1) * 15}`,
    );
  return { view, page, hasNext: rows.length > 15, rows: rows.slice(0, 15) };
}
