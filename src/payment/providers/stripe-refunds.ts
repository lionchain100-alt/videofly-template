import { and, eq } from "drizzle-orm";
import { db, paymentFulfillments, paymentOrders } from "@/db";
import { ApiError } from "@/lib/api/error";
import { getStripe } from "@/payment";
import { account } from "./stripe";
import type { RefundFact, RefundRequest } from "./types";
const id = (v: any): string | undefined => (typeof v === "string" ? v : v?.id);

async function localPayment(pi: string) {
  const c = await account();
  const scope = and(
    eq(paymentFulfillments.provider, "stripe"),
    eq(paymentFulfillments.environment, c.environment),
    eq(paymentFulfillments.accountId, c.accountId),
  );
  const [direct] = await db
    .select()
    .from(paymentFulfillments)
    .where(and(scope, eq(paymentFulfillments.paymentId, pi)));
  if (direct) return pi;
  // Subscription fulfillment receipts are invoice IDs, not PaymentIntent IDs.
  const rows = await getStripe().invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: pi },
    status: "paid",
    limit: 2,
  });
  if (rows.has_more || rows.data.length !== 1)
    throw new ApiError("Stripe 退款无法唯一关联原订阅账单", 409);
  const invoice = id(rows.data[0].invoice);
  const [linked] = invoice
    ? await db
        .select()
        .from(paymentFulfillments)
        .where(and(scope, eq(paymentFulfillments.paymentId, invoice)))
    : [];
  if (!linked) throw new ApiError("Stripe 退款无法关联本站原收款", 409);
  return linked.paymentId;
}
export async function queryStripeRefund(
  externalId: string,
): Promise<RefundFact> {
  const c = await account();
  if (!/^re_[A-Za-z0-9_]+$/.test(externalId))
    throw new ApiError("Stripe 退款编号无效", 400);
  const refund = await getStripe().refunds.retrieve(externalId);
  const pi = id(refund.payment_intent);
  if (
    refund.id !== externalId ||
    !pi ||
    !Number.isSafeInteger(refund.amount) ||
    refund.amount <= 0 ||
    !refund.currency ||
    !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(
      refund.status || "",
    )
  )
    throw new ApiError("Stripe 退款凭证不完整", 409);
  return {
    provider: "stripe",
    environment: c.environment,
    accountId: c.accountId,
    paymentId: await localPayment(pi),
    externalId: refund.id,
    reference: refund.metadata?.refundId,
    amount: refund.amount,
    currency: refund.currency.toUpperCase(),
    status:
      refund.status === "succeeded"
        ? "SUCCEEDED"
        : ["failed", "canceled"].includes(refund.status!)
          ? "FAILED"
          : "PENDING",
  };
}
async function intentForReceipt(paymentId: string) {
  if (paymentId.startsWith("pi_")) return paymentId;
  if (!paymentId.startsWith("in_"))
    throw new ApiError("Stripe 原收款编号不支持自动退款", 409);
  const rows = await getStripe().invoicePayments.list({
    invoice: paymentId,
    status: "paid",
    limit: 2,
  });
  const row = rows.data[0];
  if (
    rows.has_more ||
    rows.data.length !== 1 ||
    id(row.invoice) !== paymentId ||
    row.status !== "paid" ||
    row.payment.type !== "payment_intent" ||
    !id(row.payment.payment_intent)
  )
    throw new ApiError("Stripe 账单包含不支持或多笔收款，需人工核对", 409);
  return id(row.payment.payment_intent)!;
}
export async function createStripeRefund(
  request: RefundRequest,
): Promise<RefundFact> {
  const c = await account();
  if (
    c.environment !== "test" ||
    request.environment !== c.environment ||
    request.accountId !== c.accountId
  )
    throw new ApiError("仅允许原测试账户退款", 409);
  const pi = await intentForReceipt(request.paymentId);
  const intent = await getStripe().paymentIntents.retrieve(pi);
  const [order] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, request.orderId));
  if (
    !order ||
    order.provider !== "stripe" ||
    order.accountId !== c.accountId ||
    order.environment !== c.environment ||
    intent.livemode ||
    intent.status !== "succeeded" ||
    intent.currency.toUpperCase() !== request.currency ||
    intent.amount_received !== order.amount ||
    intent.amount_received < request.amount
  )
    throw new ApiError(
      "Stripe 原收款状态、金额、含税金额或环境不匹配，需人工核对",
      409,
    );
  const refund = await getStripe().refunds.create(
    {
      payment_intent: pi,
      amount: request.amount,
      reason: "requested_by_customer",
      metadata: { refundId: request.id },
    },
    { idempotencyKey: `refund-${request.id}` },
  );
  return queryStripeRefund(refund.id);
}
export async function findStripeRefund(
  request: RefundRequest,
): Promise<RefundFact | undefined> {
  await account();
  const pi = await intentForReceipt(request.paymentId);
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const rows = await getStripe().refunds.list({
      payment_intent: pi,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    const matches = rows.data.filter(
      (r) => r.metadata?.refundId === request.id,
    );
    if (matches.length > 1)
      throw new ApiError("Stripe 原请求关联多笔退款，需人工核实", 409);
    if (matches.length === 1) return queryStripeRefund(matches[0].id);
    if (!rows.has_more) return;
    cursor = rows.data.at(-1)?.id;
    if (!cursor) break;
  }
  throw new ApiError("Stripe 退款查询超过核对范围，需人工核实", 409);
}
