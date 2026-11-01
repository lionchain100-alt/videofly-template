import { z } from "zod";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/error";
import { getStripe } from "@/payment";
import { billingProduct, externalBillingProduct } from "../billing-catalog";
import { paymentReturnBase } from "./http";
import type {
  OrderSnapshot,
  PaymentFact,
  VerifiedEvent,
  SubscriptionFact,
} from "./types";
export function stripeConfig() {
  const key = process.env.STRIPE_API_KEY?.trim(),
    accountId = process.env.STRIPE_ACCOUNT_ID?.trim(),
    environment = process.env.STRIPE_ENVIRONMENT || "test";
  if (
    process.env.STRIPE_ENABLED !== "true" ||
    !key ||
    !process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
    !/^acct_/.test(accountId || "") ||
    !["test", "live"].includes(environment) ||
    !key.startsWith(environment === "test" ? "sk_test_" : "sk_live_")
  )
    throw new ApiError("Stripe 尚未启用或配置不完整", 503);
  return { key, accountId: accountId!, environment };
}
async function account() {
  const c = stripeConfig();
  if ((await getStripe().rawRequest("GET", "/v1/account")).id !== c.accountId)
    throw new ApiError("Stripe 收款账户与配置不一致", 409);
  return c;
}
export async function createStripeCheckout(
  order: OrderSnapshot,
  userId?: string,
) {
  await account();
  const product = billingProduct("stripe", order.productId);
  if (!product || product.externalId !== order.providerProductId)
    throw new ApiError("Stripe 产品映射已变化，需要核实订单", 409);
  const price = await getStripe().prices.retrieve(product.externalId);
  if (
    price.unit_amount !== order.amount ||
    price.currency.toUpperCase() !== order.currency ||
    price.active !== true ||
    price.livemode !== (order.environment === "live") ||
    (order.kind === "SUBSCRIPTION"
      ? price.recurring?.interval !== product.period
      : !!price.recurring)
  )
    throw new ApiError("Stripe 价格、币种、周期或环境不匹配", 409);
  const metadata = { orderId: order.id, ...(userId ? { userId } : {}) };
  const session = await getStripe().checkout.sessions.create(
    {
      mode: order.kind === "SUBSCRIPTION" ? "subscription" : "payment",
      line_items: [{ price: product.externalId, quantity: 1 }],
      client_reference_id: order.id,
      metadata,
      ...(order.kind === "SUBSCRIPTION"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
      allow_promotion_codes: false,
      success_url: `${paymentReturnBase()}/api/v1/payments/return?order=${order.id}`,
      cancel_url: `${paymentReturnBase()}/api/v1/payments/return?order=${order.id}&cancelled=1`,
    },
    { idempotencyKey: order.id },
  );
  const url = new URL(session.url || "");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password
  )
    throw new ApiError("Stripe 收银台地址无效", 502);
  return { externalId: session.id, checkoutUrl: url.href };
}
export async function stripePayment(
  sessionId: string,
): Promise<PaymentFact | undefined> {
  const c = await account(),
    session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete"
  )
    return;
  if (
    session.livemode !== (c.environment === "live") ||
    !session.metadata?.orderId ||
    session.client_reference_id !== session.metadata.orderId
  )
    throw new ApiError("Stripe 付款环境或订单关联错误", 409);
  const intent = session.payment_intent;
  if (
    !intent ||
    typeof intent === "string" ||
    intent.status !== "succeeded" ||
    intent.amount_received !== session.amount_total ||
    intent.currency !== session.currency
  )
    throw new ApiError("Stripe 收款凭证无效", 409);
  return {
    provider: "stripe",
    environment: c.environment,
    accountId: c.accountId,
    internalId: session.metadata.orderId,
    externalId: session.id,
    paymentId: intent.id,
    amount: session.amount_total!,
    currency: session.currency!.toUpperCase(),
  };
}
const record = z.record(z.string(), z.any());
export async function stripeSubscription(
  id: string,
  observedAt = new Date().toISOString(),
  invoice?: Record<string, any>,
): Promise<SubscriptionFact> {
  const c = await account(),
    s = record.parse(await getStripe().subscriptions.retrieve(id));
  const item = s.items?.data?.[0];
  if (
    !item ||
    s.items.data.length !== 1 ||
    item.quantity !== 1 ||
    s.livemode !== (c.environment === "live")
  )
    throw new ApiError("不支持的 Stripe 订阅项目或环境", 409);
  const priceId = typeof item.price === "string" ? item.price : item.price?.id;
  const product = externalBillingProduct("stripe", priceId);
  if (!product || product.kind !== "SUBSCRIPTION")
    throw new ApiError("Stripe 订阅产品未映射", 409);
  const start = item.current_period_start ?? s.current_period_start,
    end = item.current_period_end ?? s.current_period_end;
  const fact: SubscriptionFact = {
    provider: "stripe",
    environment: c.environment,
    accountId: c.accountId,
    externalId: s.id,
    customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    userId: s.metadata?.userId,
    checkoutOrderId: s.metadata?.orderId,
    productId: priceId,
    status: s.status,
    cancelAtPeriodEnd: !!(s.cancel_at_period_end || s.cancel_at),
    periodStart: new Date(start * 1000).toISOString(),
    periodEnd: new Date(end * 1000).toISOString(),
    observedAt,
  };
  if (invoice) {
    const line = invoice.lines?.data?.find(
      (l: any) =>
        l.parent?.subscription_item_details?.subscription_item === item.id ||
        l.subscription === s.id ||
        l.subscription_item === item.id,
    );
    const price = line?.pricing?.price_details?.price ?? line?.price?.id;
    if (
      !line ||
      invoice.lines.data.length !== 1 ||
      (line.quantity !== undefined && line.quantity !== 1) ||
      price !== priceId ||
      invoice.status !== "paid" ||
      invoice.paid === false ||
      invoice.livemode !== (c.environment === "live") ||
      !["subscription_create", "subscription_cycle"].includes(
        invoice.billing_reason,
      ) ||
      invoice.amount_remaining !== 0 ||
      invoice.amount_paid !== invoice.amount_due ||
      invoice.amount_paid <= 0 ||
      line.amount !== product.amount ||
      invoice.currency.toUpperCase() !== "USD"
    )
      throw new ApiError("Stripe 订阅账单需核实，未发积分", 409);
    fact.payment = {
      id: invoice.id,
      amount: line.amount,
      currency: invoice.currency.toUpperCase(),
      periodStart: new Date(line.period.start * 1000).toISOString(),
      periodEnd: new Date(line.period.end * 1000).toISOString(),
    };
  }
  return fact;
}
export async function verifyStripe(
  request: Request,
  raw: string,
): Promise<VerifiedEvent> {
  const c = stripeConfig(),
    secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ApiError("Stripe Webhook 尚未配置", 503);
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      request.headers.get("stripe-signature") || "",
      secret,
    );
  } catch {
    throw new ApiError("Stripe 回调验签失败或已过期", 400);
  }
  if (
    event.livemode !== (c.environment === "live") ||
    (event.account && event.account !== c.accountId)
  )
    throw new ApiError("Stripe 回调账户或环境不匹配", 400);
  const object = record.parse(event.data.object),
    result: VerifiedEvent = {
      id: event.id,
      type: event.type,
      provider: "stripe",
      environment: c.environment,
      accountId: c.accountId,
      fingerprint: createHash("sha256").update(raw).digest("hex"),
    };
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    if (object.mode === "payment") {
      result.fact = await stripePayment(object.id);
      result.internalId = result.fact?.internalId;
      result.externalId = object.id;
    } else if (object.subscription)
      result.subscription = await stripeSubscription(
        typeof object.subscription === "string"
          ? object.subscription
          : object.subscription.id,
        new Date(event.created * 1000).toISOString(),
      );
  } else if (
    ["invoice.paid", "invoice.payment_succeeded"].includes(event.type)
  ) {
    const invoice = record.parse(
      await getStripe().invoices.retrieve(object.id, {
        expand: ["lines.data"],
      }),
    );
    const sub =
      invoice.parent?.subscription_details?.subscription ??
      invoice.subscription;
    if (sub)
      result.subscription = await stripeSubscription(
        typeof sub === "string" ? sub : sub.id,
        new Date(event.created * 1000).toISOString(),
        invoice,
      );
  } else if (event.type.startsWith("customer.subscription."))
    result.subscription = await stripeSubscription(
      object.id,
      new Date(event.created * 1000).toISOString(),
    );
  return result;
}
export async function changeStripeSubscription(
  id: string,
  action: "cancel" | "resume",
) {
  await account();
  const current = await getStripe().subscriptions.retrieve(id);
  if (!["active", "trialing", "past_due"].includes(current.status))
    throw new ApiError("该订阅已结束，恢复需重新订阅", 409);
  await getStripe().subscriptions.update(id, {
    cancel_at_period_end: action === "cancel",
  });
  return stripeSubscription(id);
}
