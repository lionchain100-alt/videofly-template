import { ApiError } from "@/lib/api/error";
import { paymentFetch, paymentReturnBase } from "./http";
import {
  cents,
  decimal,
  type OrderSnapshot,
  type PaymentFact,
  type VerifiedEvent,
  type RefundFact,
  type RefundRequest,
} from "./types";
import { z } from "zod";

export function paypalConfig() {
  const environment = process.env.PAYPAL_ENVIRONMENT || "sandbox";
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const accountId = process.env.PAYPAL_MERCHANT_ID?.trim();
  if (
    process.env.PAYPAL_ENABLED !== "true" ||
    !clientId ||
    !secret ||
    !accountId ||
    !["sandbox", "live"].includes(environment)
  )
    throw new ApiError("PayPal 尚未启用或配置不完整", 503);
  return {
    clientId,
    secret,
    accountId,
    environment,
    base:
      environment === "sandbox"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com",
  };
}
export async function paypalRequest(
  path: string,
  method = "GET",
  body?: unknown,
  requestId?: string,
) {
  const c = paypalConfig();
  const auth = await paymentFetch(`${c.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (typeof auth.access_token !== "string")
    throw new ApiError("PayPal 认证失败", 502);
  return paymentFetch(`${c.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      "Content-Type": "application/json",
      ...(requestId
        ? { "PayPal-Request-Id": requestId, Prefer: "return=representation" }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
export async function createPaypalCheckout(order: OrderSnapshot) {
  const data = await paypalRequest(
    "/v2/checkout/orders",
    "POST",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.id,
          invoice_id: order.id,
          payee: { merchant_id: order.accountId },
          description: order.productName,
          amount: {
            currency_code: order.currency,
            value: decimal(order.amount),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: `${paymentReturnBase()}/api/v1/payments/return?order=${order.id}`,
            cancel_url: `${paymentReturnBase()}/api/v1/payments/return?order=${order.id}&cancelled=1`,
          },
        },
      },
    },
    order.id,
  );
  const id = z
    .string()
    .regex(/^[A-Z0-9]{8,40}$/)
    .parse(data.id);
  const link = data.links?.find((v: { rel: string }) =>
    ["payer-action", "approve"].includes(v.rel),
  )?.href;
  const url = new URL(link);
  const expected =
    order.environment === "sandbox"
      ? "www.sandbox.paypal.com"
      : "www.paypal.com";
  if (
    url.protocol !== "https:" ||
    url.hostname !== expected ||
    url.username ||
    url.password
  )
    throw new ApiError("PayPal 返回的收银台地址无效", 502);
  return { externalId: id, checkoutUrl: url.href };
}
const unitSchema = z.object({
  custom_id: z.string(),
  payee: z.object({ merchant_id: z.string() }),
  amount: z.object({ currency_code: z.string(), value: z.string() }),
  payments: z
    .object({
      captures: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          final_capture: z.boolean().optional(),
          amount: z.object({ currency_code: z.string(), value: z.string() }),
        }),
      ),
    })
    .optional(),
});
export function paypalFact(
  order: OrderSnapshot,
  data: unknown,
): PaymentFact | null {
  const value = z
    .object({
      id: z.string(),
      status: z.string(),
      purchase_units: z.array(unitSchema).length(1),
    })
    .parse(data);
  if (value.id !== order.externalId)
    throw new ApiError("PayPal 订单关联不一致", 409);
  const unit = value.purchase_units[0];
  if (
    unit.custom_id !== order.id ||
    unit.payee.merchant_id !== order.accountId ||
    unit.amount.currency_code !== order.currency ||
    cents(unit.amount.value) !== order.amount
  )
    throw new ApiError("PayPal 收款对象或金额不一致，未发积分", 409);
  if (value.status !== "COMPLETED") return null;
  const captures = unit.payments?.captures;
  if (
    captures?.length !== 1 ||
    captures[0].status !== "COMPLETED" ||
    cents(captures[0].amount.value) !== order.amount ||
    captures[0].amount.currency_code !== order.currency
  )
    throw new ApiError("PayPal 收款尚未完整确认，未发积分", 409);
  return {
    internalId: order.id,
    externalId: value.id,
    paymentId: captures[0].id,
    provider: "paypal",
    environment: order.environment,
    accountId: order.accountId,
    amount: order.amount,
    currency: order.currency,
  };
}
export async function queryPaypal(
  order: OrderSnapshot,
  captureApproved = true,
) {
  if (!order.externalId) return null;
  const data = await paypalRequest(
    `/v2/checkout/orders/${encodeURIComponent(order.externalId)}`,
  );
  const knownFact = paypalFact(order, data);
  // Stable capture key; no automatic retry beyond PayPal's documented retention window.
  if (data.status === "APPROVED" && captureApproved) {
    const captured = await paypalRequest(
      `/v2/checkout/orders/${encodeURIComponent(order.externalId)}/capture`,
      "POST",
      {},
      `${order.id}-cap`,
    );
    return paypalFact(order, captured);
  }
  return knownFact;
}
export async function verifyPaypal(
  request: Request,
  raw: string,
): Promise<VerifiedEvent> {
  const c = paypalConfig();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) throw new ApiError("PayPal Webhook ID 尚未配置", 503);
  const event = JSON.parse(raw);
  const fields = [
    "auth_algo",
    "cert_url",
    "transmission_id",
    "transmission_sig",
    "transmission_time",
  ] as const;
  const headers = Object.fromEntries(
    fields.map((k) => [
      k,
      request.headers.get(`paypal-${k.replaceAll("_", "-")}`),
    ]),
  );
  if (Object.values(headers).some((v) => !v))
    throw new ApiError("PayPal 回调签名缺失", 400);
  const verified = await paypalRequest(
    "/v1/notifications/verify-webhook-signature",
    "POST",
    { ...headers, webhook_id: webhookId, webhook_event: event },
  );
  if (verified.verification_status !== "SUCCESS")
    throw new ApiError("PayPal 回调验签失败", 400);
  const parsed = z
    .object({
      id: z.string().min(1).max(200),
      event_type: z.string().min(1).max(200),
      resource: z.record(z.string(), z.unknown()),
    })
    .parse(event);
  const resource = parsed.resource as {
    id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
  const externalId = parsed.event_type.startsWith("CHECKOUT.ORDER.")
    ? resource.id
    : resource.supplementary_data?.related_ids?.order_id;
  const refund =
    [
      "PAYMENT.CAPTURE.REFUNDED",
      "PAYMENT.REFUND.PENDING",
      "PAYMENT.REFUND.FAILED",
    ].includes(parsed.event_type) && resource.id
      ? await queryPaypalRefundId(resource.id)
      : undefined;
  return {
    id: parsed.id,
    type: parsed.event_type,
    provider: "paypal",
    environment: c.environment,
    accountId: c.accountId,
    externalId,
    refund,
  };
}

export function paypalRefundFact(data: unknown): RefundFact {
  const c = paypalConfig();
  const r = z
    .object({
      id: z.string().min(1).max(200),
      status: z.enum(["COMPLETED", "PENDING", "FAILED", "CANCELLED"]),
      amount: z.object({ value: z.string(), currency_code: z.string() }),
      invoice_id: z.string().optional(),
      links: z.array(z.object({ rel: z.string(), href: z.string() })),
    })
    .parse(data);
  const up = r.links.find((l) => l.rel === "up");
  if (!up) throw new ApiError("退款缺少原收款关联", 409);
  const u = new URL(up.href);
  const capture = /^\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(u.pathname);
  const hosts =
    c.environment === "sandbox"
      ? ["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"]
      : ["api-m.paypal.com", "api.paypal.com"];
  if (u.protocol !== "https:" || !hosts.includes(u.hostname) || !capture)
    throw new ApiError("退款原收款关联无效", 409);
  return {
    provider: "paypal",
    environment: c.environment,
    accountId: c.accountId,
    paymentId: capture[1],
    externalId: r.id,
    reference: r.invoice_id,
    amount: cents(r.amount.value),
    currency: r.amount.currency_code,
    status:
      r.status === "COMPLETED"
        ? "SUCCEEDED"
        : ["FAILED", "CANCELLED"].includes(r.status)
          ? "FAILED"
          : "PENDING",
  };
}
export async function createPaypalRefund(r: RefundRequest) {
  const c = paypalConfig();
  if (c.environment !== r.environment || c.accountId !== r.accountId)
    throw new ApiError("退款账户或环境已变更", 409);
  const data = await paypalRequest(
    `/v2/payments/captures/${encodeURIComponent(r.paymentId)}/refund`,
    "POST",
    {
      amount: { value: decimal(r.amount), currency_code: r.currency },
      invoice_id: r.id,
      note_to_payer: r.reason.slice(0, 200),
    },
    r.id,
  );
  return paypalRefundFact(data);
}
export async function queryPaypalRefundId(id: string) {
  return paypalRefundFact(
    await paypalRequest(`/v2/payments/refunds/${encodeURIComponent(id)}`),
  );
}
