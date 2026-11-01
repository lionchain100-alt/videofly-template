import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/api/error";
import { billingProduct, externalBillingProduct } from "../billing-catalog";
import { paymentFetch, paymentReturnBase } from "./http";
import type {
  OrderSnapshot,
  PaymentFact,
  SubscriptionFact,
  VerifiedEvent,
} from "./types";
export function creemConfig() {
  const key = process.env.CREEM_API_KEY?.trim(),
    accountId = process.env.CREEM_ACCOUNT_SCOPE?.trim(),
    environment = process.env.CREEM_ENVIRONMENT || "test";
  if (
    process.env.CREEM_ENABLED !== "true" ||
    !key ||
    !process.env.CREEM_WEBHOOK_SECRET?.trim() ||
    !accountId ||
    !["test", "live"].includes(environment) ||
    (environment === "test" && !key.startsWith("creem_test_")) ||
    (environment === "live" && key.startsWith("creem_test_"))
  )
    throw new ApiError("Creem 尚未启用或配置不完整", 503);
  return {
    key,
    accountId,
    environment,
    base:
      environment === "test"
        ? "https://test-api.creem.io"
        : "https://api.creem.io",
  };
}
export function creemRequest(path: string, method = "GET", body?: unknown) {
  const c = creemConfig();
  return paymentFetch(c.base + path, {
    method,
    headers: { "x-api-key": c.key, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const id = (v: any): string => (typeof v === "string" ? v : v?.id);
const iso = (v: any) => {
  const d = new Date(typeof v === "number" && v < 1e12 ? v * 1000 : v);
  if (!Number.isFinite(d.getTime())) throw new ApiError("Creem 日期无效", 409);
  return d.toISOString();
};
function mode(v: any) {
  const c = creemConfig();
  if (v.mode !== (c.environment === "test" ? "test" : "prod"))
    throw new ApiError("Creem 付款环境不匹配", 409);
}
export async function createCreemCheckout(
  order: OrderSnapshot,
  userId?: string,
) {
  const product = billingProduct("creem", order.productId);
  if (!product || product.externalId !== order.providerProductId)
    throw new ApiError("Creem 产品映射已变化，需要核实订单", 409);
  const actual = await creemRequest(
    `/v1/products?product_id=${encodeURIComponent(product.externalId)}`,
  );
  mode(actual);
  if (
    actual.price !== order.amount ||
    actual.currency?.toUpperCase() !== order.currency ||
    (order.kind === "SUBSCRIPTION"
      ? actual.billing_period !== `every-${product.period}`
      : !["onetime", "one-time"].includes(actual.billing_type))
  )
    throw new ApiError("Creem 产品价格、币种或周期不匹配", 409);
  const data = await creemRequest("/v1/checkouts", "POST", {
    product_id: product.externalId,
    request_id: order.id,
    units: 1,
    success_url: `${paymentReturnBase()}/api/v1/payments/return?order=${order.id}`,
    metadata: {
      orderId: order.id,
      ...(userId ? { userId, referenceId: userId } : {}),
    },
  });
  mode(data);
  const url = new URL(data.checkout_url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    ![
      "www.creem.io",
      "creem.io",
      "checkout.creem.io",
      "test-checkout.creem.io",
      "test.creem.io",
    ].includes(url.hostname)
  )
    throw new ApiError("Creem 收银台地址无效", 502);
  return {
    externalId: z.string().startsWith("ch_").parse(data.id),
    checkoutUrl: url.href,
  };
}
export async function creemPayment(
  checkoutId: string,
): Promise<PaymentFact | undefined> {
  const c = creemConfig(),
    checkout = await creemRequest(
      `/v1/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`,
    );
  mode(checkout);
  if (checkout.subscription || checkout.status !== "completed") return;
  const order = checkout.order;
  if (!order || typeof order !== "object" || order.status !== "paid") return;
  mode(order);
  const product = externalBillingProduct("creem", id(checkout.product));
  const ref = checkout.request_id,
    internalId = checkout.metadata?.orderId;
  if (
    !product ||
    product.kind !== "PURCHASE" ||
    !internalId ||
    ref !== internalId ||
    order.amount !== product.amount ||
    order.currency?.toUpperCase() !== "USD" ||
    (order.discount_amount || 0) !== 0 ||
    order.amount_paid < order.amount ||
    id(order.product) !== product.externalId
  )
    throw new ApiError("Creem 到账信息需核实，未发积分", 409);
  return {
    provider: "creem",
    environment: c.environment,
    accountId: c.accountId,
    internalId,
    externalId: checkout.id,
    paymentId: id(order.transaction) || order.id,
    amount: order.amount,
    currency: order.currency.toUpperCase(),
  };
}
export async function creemSubscription(
  subscriptionId: string,
  observedAt = new Date().toISOString(),
  paidTransactionId?: string,
): Promise<SubscriptionFact> {
  const c = creemConfig(),
    s = await creemRequest(
      `/v1/subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`,
    );
  mode(s);
  const externalProduct = id(s.product),
    product = externalBillingProduct("creem", externalProduct);
  if (
    !product ||
    product.kind !== "SUBSCRIPTION" ||
    s.items?.some((item: any) => item.units !== 1)
  )
    throw new ApiError("Creem 订阅产品或数量未映射", 409);
  const fact: SubscriptionFact = {
    provider: "creem",
    environment: c.environment,
    accountId: c.accountId,
    externalId: s.id,
    customerId: id(s.customer),
    productId: externalProduct,
    userId: s.metadata?.userId || s.metadata?.referenceId,
    checkoutOrderId: s.metadata?.orderId,
    status: s.status,
    cancelAtPeriodEnd: s.status === "scheduled_cancel",
    periodStart: iso(s.current_period_start_date),
    periodEnd: iso(s.current_period_end_date),
    observedAt,
  };
  if (paidTransactionId) {
    const tx = await creemRequest(
      `/v1/transactions?transaction_id=${encodeURIComponent(paidTransactionId)}`,
    );
    mode(tx);
    if (
      tx.status !== "paid" ||
      tx.type !== "invoice" ||
      id(tx.subscription) !== s.id ||
      id(tx.customer) !== fact.customerId ||
      tx.amount !== product.amount ||
      tx.amount_paid < tx.amount ||
      (tx.discount_amount || 0) !== 0 ||
      tx.currency?.toUpperCase() !== "USD"
    )
      throw new ApiError("Creem 订阅收款凭证需核实，未发积分", 409);
    fact.payment = {
      id: tx.id,
      amount: tx.amount,
      currency: tx.currency.toUpperCase(),
      periodStart: iso(tx.period_start),
      periodEnd: iso(tx.period_end),
    };
  }
  return fact;
}
export async function verifyCreem(
  request: Request,
  raw: string,
): Promise<VerifiedEvent> {
  const c = creemConfig(),
    secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("Creem Webhook 尚未配置", 503);
  const signature = request.headers.get("creem-signature") || "",
    expected = createHmac("sha256", secret).update(raw).digest();
  if (
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !timingSafeEqual(Buffer.from(signature, "hex"), expected)
  )
    throw new ApiError("Creem 回调验签失败", 400);
  const event = z
    .object({
      id: z.string().min(1).max(200),
      eventType: z.string().min(1).max(100),
      created_at: z.union([z.string(), z.number()]),
      object: z.record(z.string(), z.any()),
    })
    .parse(JSON.parse(raw));
  const object = event.object;
  mode(object);
  const result: VerifiedEvent = {
    id: event.id,
    type: event.eventType,
    provider: "creem",
    environment: c.environment,
    accountId: c.accountId,
    fingerprint: createHash("sha256").update(raw).digest("hex"),
  };
  if (event.eventType === "checkout.completed") {
    if (object.subscription)
      result.subscription = await creemSubscription(
        id(object.subscription),
        iso(event.created_at),
      );
    else {
      result.fact = await creemPayment(object.id);
      result.internalId = result.fact?.internalId;
      result.externalId = object.id;
    }
  } else if (event.eventType.startsWith("subscription.")) {
    const paid = event.eventType === "subscription.paid";
    const transaction = paid
      ? id(object.last_transaction) || object.last_transaction_id
      : undefined;
    if (paid && !transaction)
      throw new ApiError("Creem 续费通知缺少交易凭证", 409);
    result.subscription = await creemSubscription(
      object.id,
      iso(event.created_at),
      transaction,
    );
  }
  return result;
}
export async function changeCreemSubscription(
  id: string,
  action: "cancel" | "resume",
) {
  const current = await creemSubscription(id);
  if (["canceled", "expired"].includes(current.status))
    throw new ApiError("该订阅已结束，恢复需重新订阅", 409);
  if (
    (action === "cancel" && current.cancelAtPeriodEnd) ||
    (action === "resume" &&
      current.status === "active" &&
      !current.cancelAtPeriodEnd)
  )
    return current;
  await creemRequest(
    `/v1/subscriptions/${encodeURIComponent(id)}/${action === "cancel" ? "cancel" : "resume"}`,
    "POST",
    action === "cancel" ? { mode: "scheduled", onExecute: "cancel" } : {},
  );
  return creemSubscription(id);
}
