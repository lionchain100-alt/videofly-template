import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { ApiError } from "@/lib/api/error";
import { z } from "zod";
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

export function waffoConfig() {
  const environment = process.env.WAFFO_ENVIRONMENT || "test";
  const accountId = process.env.WAFFO_MERCHANT_ID?.trim();
  const storeId = process.env.WAFFO_STORE_ID?.trim();
  const privateKey = process.env.WAFFO_PRIVATE_KEY?.replaceAll(
    "\\n",
    "\n",
  ).trim();
  const publicKey = process.env.WAFFO_WEBHOOK_PUBLIC_KEY?.replaceAll(
    "\\n",
    "\n",
  ).trim();
  if (
    process.env.WAFFO_ENABLED !== "true" ||
    !accountId ||
    !storeId ||
    !privateKey ||
    !publicKey ||
    !process.env.WAFFO_PRODUCT_STARTER?.startsWith("PROD_") ||
    !process.env.WAFFO_PRODUCT_STANDARD?.startsWith("PROD_") ||
    !paymentReturnBase(process.env.WAFFO_RETURN_BASE_URL).startsWith(
      "https://",
    ) ||
    !["test", "prod"].includes(environment)
  )
    throw new ApiError("Waffo Pancake 尚未启用或配置不完整", 503);
  try {
    // The dashboard download currently uses base64 DER despite its .pem suffix.
    // Accept both native dashboard values and standard PEM environment variables.
    const privateObject = privateKey.includes("-----BEGIN")
      ? createPrivateKey(privateKey)
      : createPrivateKey({
          key: Buffer.from(privateKey, "base64"),
          format: "der",
          type: "pkcs8",
        });
    const publicObject = publicKey.includes("-----BEGIN")
      ? createPublicKey(publicKey)
      : createPublicKey({
          key: Buffer.from(publicKey, "base64"),
          format: "der",
          type: "spki",
        });
    if (
      privateObject.asymmetricKeyType !== "rsa" ||
      publicObject.asymmetricKeyType !== "rsa"
    )
      throw new Error("RSA required");
    return {
      environment,
      accountId,
      storeId,
      privateKey: privateObject
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      publicKey: publicObject
        .export({ format: "pem", type: "spki" })
        .toString(),
    };
  } catch {
    throw new ApiError("Waffo RSA 私钥或平台验签公钥格式不正确", 503);
  }
}
export async function waffoRequest(path: string, body: unknown, key?: string) {
  const c = waffoConfig();
  const text = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `POST\n${path}\n${timestamp}\n${createHash("sha256").update(text).digest("base64")}`;
  const signature = sign(
    "sha256",
    Buffer.from(canonical),
    c.privateKey,
  ).toString("base64");
  const response = await paymentFetch(`https://api.waffo.ai${path}`, {
    method: "POST",
    body: text,
    headers: {
      "Content-Type": "application/json",
      "X-Merchant-Id": c.accountId,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
      ...(key ? { "X-Idempotency-Key": `${c.accountId}-${key}` } : {}),
    },
  });
  if (response.errors?.length || !response.data)
    throw new ApiError("Waffo 暂未确认请求，请保留订单稍后查询", 502);
  return response.data;
}
export async function createWaffoCheckout(order: OrderSnapshot) {
  const productId =
    process.env[`WAFFO_PRODUCT_${order.productId.toUpperCase()}`];
  if (!productId || !/^PROD_[A-Za-z0-9]+$/.test(productId))
    throw new ApiError("Waffo 积分包产品尚未映射", 503);
  const base = paymentReturnBase(process.env.WAFFO_RETURN_BASE_URL);
  if (!base.startsWith("https://"))
    throw new ApiError("Waffo 回跳需要 HTTPS 地址，请先配置本地隧道", 503);
  const data = await waffoRequest(
    "/v1/actions/checkout/create-session",
    {
      productId,
      currency: order.currency,
      priceSnapshot: {
        amount: decimal(order.amount),
        taxIncluded: true,
        taxCategory: "saas",
      },
      orderMerchantExternalId: order.id,
      metadata: { orderId: order.id },
      allowPromotionCodes: false,
      successUrl: `${base}/api/v1/payments/return?order=${order.id}`,
      expiresInSeconds: 3600,
    },
    order.id,
  );
  const sessionId = z
    .string()
    .regex(/^cs_[a-f0-9-]{36}$/i)
    .parse(data.sessionId);
  const url = new URL(data.checkoutUrl);
  if (
    url.protocol !== "https:" ||
    !["checkout.waffo.ai", "pancake.waffo.ai"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new ApiError("Waffo 返回的收银台地址无效", 502);
  return { externalId: sessionId, checkoutUrl: url.href };
}
export function verifyWaffo(request: Request, raw: string): VerifiedEvent {
  const c = waffoConfig();
  const header = request.headers.get("x-waffo-signature") || "";
  const parts = Object.fromEntries(
    header.split(",").map((s) => {
      const p = s.indexOf("=");
      return [s.slice(0, p).trim(), s.slice(p + 1).trim()];
    }),
  );
  const t = parts.t;
  if (
    !/^\d{13}$/.test(t || "") ||
    Math.abs(Date.now() - Number(t)) > 45 * 60 * 1000 ||
    !parts.v1 ||
    !verify(
      "RSA-SHA256",
      Buffer.from(`${t}.${raw}`),
      c.publicKey,
      Buffer.from(parts.v1, "base64"),
    )
  )
    throw new ApiError("Waffo 回调验签失败或已过期", 400);
  const event = z
    .object({
      eventId: z.string().min(1).max(200),
      eventType: z.string().min(1).max(100),
      storeId: z.string(),
      mode: z.string(),
      data: z.record(z.string(), z.unknown()),
    })
    .parse(JSON.parse(raw));
  if (event.storeId !== c.storeId || event.mode !== c.environment)
    throw new ApiError("Waffo 店铺或测试环境不一致", 400);
  const data = event.data;
  const reference = z.string().uuid().safeParse(data.orderMerchantExternalId);
  const internalId = reference.success ? reference.data : undefined;
  let fact: PaymentFact | undefined;
  let refund: RefundFact | undefined;
  // Dashboard connectivity samples and other applications' orders have no local UUID.
  // A valid signature is acknowledged, but these events never create site credits.
  if (event.eventType === "order.completed" && internalId) {
    const value = z
      .object({
        orderId: z.string().min(1),
        paymentId: z.string().min(1),
        paymentStatus: z.literal("succeeded"),
        orderStatus: z.literal("completed"),
        chargedAmount: z.string(),
        currency: z.string(),
        orderMerchantExternalId: z.string().uuid(),
      })
      .parse(data);
    fact = {
      internalId: value.orderMerchantExternalId,
      externalId: value.orderId,
      paymentId: value.paymentId,
      provider: "waffo",
      environment: c.environment,
      accountId: c.accountId,
      amount: cents(value.chargedAmount),
      currency: value.currency,
    };
  }
  if (
    ["refund.succeeded", "refund.failed"].includes(event.eventType) &&
    internalId
  ) {
    const r = z
      .object({
        paymentId: z.string().min(1),
        refundStatus: z.enum(["succeeded", "failed"]),
        currency: z.string(),
        refundedAmount: z.string().optional(),
        amount: z.string().optional(),
        refundTicketMerchantExternalId: z.string().optional(),
      })
      .parse(data);
    refund = {
      provider: "waffo",
      environment: c.environment,
      accountId: c.accountId,
      paymentId: r.paymentId,
      externalId: event.eventId,
      reference: r.refundTicketMerchantExternalId,
      amount: cents(r.refundedAmount ?? r.amount),
      currency: r.currency,
      status: r.refundStatus === "succeeded" ? "SUCCEEDED" : "FAILED",
    };
  }
  return {
    id: `${event.eventType}:${event.eventId}`,
    type: event.eventType,
    provider: "waffo",
    environment: c.environment,
    accountId: c.accountId,
    internalId,
    fact,
    refund,
  };
}
// GraphQL priceSnapshot is an expected amount, not necessarily the captured amount.
// Until the merchant's real API schema is validated, only signed chargedAmount is a fulfillment fact.
export async function queryWaffo(order: OrderSnapshot) {
  const c = waffoConfig();
  return waffoRequest("/v1/graphql", {
    query: `query($storeId: String!, $ref: String!) {
    onetimeOrders(storeId: $storeId, filter: {orderMerchantExternalId: {eq: $ref}}) {
      id status orderMerchantExternalId
    }
  }`,
    variables: { storeId: c.storeId, ref: order.id },
  });
}

export async function createWaffoRefund(r: RefundRequest) {
  const c = waffoConfig();
  if (c.environment !== r.environment || c.accountId !== r.accountId)
    throw new ApiError("退款账户或环境已变更", 409);
  const data = await waffoRequest(
    "/v1/actions/refund-ticket/create-ticket",
    {
      paymentId: r.paymentId,
      reason: r.reason,
      requestedAmount: { amount: decimal(r.amount), currency: r.currency },
      refundTicketMerchantExternalId: r.id,
    },
    r.id,
  );
  const ticket = z
    .object({ id: z.string().startsWith("TKT_"), status: z.string() })
    .parse(data.ticket);
  return ticket.id;
}
export async function queryWaffoRefunds(
  r: RefundRequest,
): Promise<RefundFact[]> {
  const c = waffoConfig();
  if (c.environment !== r.environment || c.accountId !== r.accountId)
    throw new ApiError("退款账户或环境已变更", 409);
  const data = await waffoRequest("/v1/graphql", {
    query: `query($ref:String!){refunds(filter:{refundTicketMerchantExternalId:{eq:$ref}}){id paymentId status refundTicketMerchantExternalId pspAmountDetails{amount currency}}}`,
    variables: { ref: r.id },
  });
  return z
    .array(
      z.object({
        id: z.string(),
        paymentId: z.string(),
        status: z.string(),
        refundTicketMerchantExternalId: z.string().optional(),
        pspAmountDetails: z
          .object({ amount: z.string(), currency: z.string() })
          .nullable(),
      }),
    )
    .parse(data.refunds)
    .flatMap((v) => {
      if (
        v.paymentId !== r.paymentId ||
        v.refundTicketMerchantExternalId !== r.id
      )
        throw new ApiError("Waffo 退款查询与原请求关联不一致", 409);
      if (!v.pspAmountDetails || !["succeeded", "failed"].includes(v.status))
        return [];
      return [
        {
          provider: "waffo" as const,
          environment: c.environment,
          accountId: c.accountId,
          paymentId: v.paymentId,
          externalId: v.id,
          reference: v.refundTicketMerchantExternalId,
          amount: cents(v.pspAmountDetails.amount),
          currency: v.pspAmountDetails.currency,
          status:
            v.status === "succeeded"
              ? ("SUCCEEDED" as const)
              : ("FAILED" as const),
        },
      ];
    });
}
