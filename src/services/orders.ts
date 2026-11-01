import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  users,
  creditPackages,
  creditTransactions,
  paymentOrders,
  paymentEvents,
  paymentFulfillments,
} from "@/db";
import { ApiError } from "@/lib/api/error";
import { creditCatalog } from "@/payment/catalog";
import { subscriptionCatalog, billingProduct } from "@/payment/billing-catalog";
import {
  paymentProviders,
  paymentConfig,
  createCheckout,
  queryCheckout,
} from "@/payment/providers/registry";
import { queryPaypal } from "@/payment/providers/paypal";
import type {
  OrderSnapshot,
  PaymentFact,
  PaymentProvider,
  VerifiedEvent,
} from "@/payment/providers/types";

export const purchaseSchema = z
  .object({
    requestId: z.string().uuid(),
    provider: z.enum(paymentProviders),
    productId: z.string().min(1).max(50),
  })
  .strict();
type Order = typeof paymentOrders.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function config(provider: PaymentProvider) {
  return paymentConfig(provider);
}
function snapshot(order: Order): OrderSnapshot {
  return { ...order, provider: order.provider as PaymentProvider };
}
export function publicPayments() {
  return {
    products: creditCatalog.map((p) => ({
      ...p,
      providers: paymentProviders.filter(
        (id) => id === "paypal" || id === "waffo" || !!billingProduct(id, p.id),
      ),
    })),
    subscriptions: subscriptionCatalog.map((p) => ({
      ...p,
      providers: (["stripe", "creem"] as const).filter(
        (id) => !!billingProduct(id, p.id),
      ),
    })),
    providers: paymentProviders.map((id) => {
      try {
        const c = config(id);
        return { id, enabled: true, environment: c.environment };
      } catch {
        return {
          id,
          enabled: false,
          environment: id === "paypal" ? "sandbox" : "test",
        };
      }
    }),
  };
}
export async function reserveOrder(
  userId: string,
  input: z.infer<typeof purchaseSchema>,
) {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user || user.disabled) throw new ApiError("账户不可用", 403);
    const [existing] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.userId, userId),
          eq(paymentOrders.requestId, input.requestId),
        ),
      );
    if (existing) {
      if (
        existing.provider !== input.provider ||
        existing.productId !== input.productId
      )
        throw new ApiError("请求编号已用于其他购买内容", 409);
      return existing;
    }
    const c = config(input.provider);
    const mapped =
      input.provider === "stripe" || input.provider === "creem"
        ? billingProduct(input.provider, input.productId)
        : undefined;
    const product =
      mapped ||
      (input.provider === "paypal" || input.provider === "waffo"
        ? creditCatalog.find((p) => p.id === input.productId)
        : undefined);
    if (!product)
      throw new ApiError("支付产品不存在或尚未配置通道产品映射", 400);
    const [count] = await tx
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(paymentOrders)
      .where(
        and(
          eq(paymentOrders.userId, userId),
          gt(paymentOrders.createdAt, new Date(Date.now() - 3600000)),
        ),
      );
    if (count.value >= 10)
      throw new ApiError("创建订单过于频繁，请使用已有订单或稍后重试", 429);
    const [order] = await tx
      .insert(paymentOrders)
      .values({
        id: randomUUID(),
        userId,
        requestId: input.requestId,
        provider: input.provider,
        kind: mapped?.kind || "PURCHASE",
        providerProductId: mapped?.externalId,
        environment: c.environment,
        accountId: c.accountId,
        productId: product.id,
        productName: product.name,
        amount: product.amount,
        currency: product.currency,
        credits: product.credits,
        expiryDays: product.expiryDays,
      })
      .returning();
    return order;
  });
}
// Provider HTTP runs outside database transactions. Claim leases survive process restarts.
export async function processOrder(id?: string) {
  const now = new Date();
  const token = randomUUID();
  const order = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentOrders)
      .where(
        and(
          id ? eq(paymentOrders.id, id) : undefined,
          sql`${paymentOrders.status} in ('CREATING','PENDING')`,
          lt(paymentOrders.nextCheckAt, now),
          or(
            isNull(paymentOrders.leaseUntil),
            lt(paymentOrders.leaseUntil, now),
          ),
        ),
      )
      .orderBy(asc(paymentOrders.nextCheckAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(paymentOrders)
      .set({ leaseToken: token, leaseUntil: new Date(Date.now() + 120000) })
      .where(eq(paymentOrders.id, row.id));
    return row;
  });
  if (!order) return false;
  try {
    const c = config(order.provider as PaymentProvider);
    if (c.accountId !== order.accountId || c.environment !== order.environment)
      throw new ApiError("订单所属支付账户与当前配置不一致", 409);
    if (order.status === "CREATING") {
      // Both APIs deduplicate transient retries. Never recreate after the conservative one-hour window.
      if (Date.now() - order.createdAt.getTime() > 3600000)
        throw new ApiError("创建结果需人工核实", 409);
      const checkout = await createCheckout(snapshot(order), order.userId);
      await db
        .update(paymentOrders)
        .set({ ...checkout, status: "PENDING", updatedAt: new Date() })
        .where(
          and(
            eq(paymentOrders.id, order.id),
            eq(paymentOrders.leaseToken, token),
            eq(paymentOrders.status, "CREATING"),
          ),
        );
    } else {
      const fact = await queryCheckout(snapshot(order));
      if (fact) await fulfillPayment(fact);
    }
    if (Date.now() - order.createdAt.getTime() > 7 * 86400000)
      await db
        .update(paymentOrders)
        .set({ status: "REVIEW" })
        .where(
          and(
            eq(paymentOrders.id, order.id),
            eq(paymentOrders.status, "PENDING"),
          ),
        );
  } catch (error) {
    if (error instanceof ApiError && error.status === 409)
      await db
        .update(paymentOrders)
        .set({ status: "REVIEW", updatedAt: new Date() })
        .where(
          and(
            eq(paymentOrders.id, order.id),
            sql`${paymentOrders.status} <> 'PAID'`,
          ),
        );
    // Network / DB errors remain pending for durable retry; no raw provider payload in logs.
  } finally {
    await db
      .update(paymentOrders)
      .set({
        leaseToken: null,
        leaseUntil: null,
        nextCheckAt: new Date(Date.now() + 30000),
      })
      .where(
        and(
          eq(paymentOrders.id, order.id),
          eq(paymentOrders.leaseToken, token),
        ),
      );
  }
  return true;
}
export async function fulfill(
  tx: Tx,
  fact: PaymentFact,
  hint: Order,
  subscriptionExpiresAt?: Date,
) {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, hint.userId))
    .for("update");
  const [order] = await tx
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, hint.id))
    .for("update");
  if (
    !order ||
    fact.internalId !== order.id ||
    fact.provider !== order.provider ||
    fact.environment !== order.environment ||
    fact.accountId !== order.accountId ||
    fact.amount !== order.amount ||
    fact.currency !== order.currency ||
    (["paypal", "stripe", "creem"].includes(order.provider) &&
      fact.externalId !== order.externalId)
  )
    throw new ApiError("到账信息与订单不一致，未发积分", 409);
  const [existing] = await tx
    .select()
    .from(paymentFulfillments)
    .where(eq(paymentFulfillments.orderId, order.id));
  if (existing) {
    if (existing.paymentId !== fact.paymentId)
      throw new ApiError("同一订单出现另一笔收款，需要人工核实", 409);
    return existing;
  }
  const now = new Date();
  const [pkg] = await tx
    .insert(creditPackages)
    .values({
      userId: order.userId,
      initialCredits: order.credits,
      remainingCredits: order.credits,
      frozenCredits: 0,
      transType: order.kind === "SUBSCRIPTION" ? "SUBSCRIPTION" : "ORDER_PAY",
      orderNo: order.id,
      status: "ACTIVE",
      expiredAt:
        subscriptionExpiresAt ||
        new Date(now.getTime() + order.expiryDays * 86400000),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const [balance] = await tx
    .select({
      value:
        sql<number>`coalesce(sum(${creditPackages.remainingCredits}),0)`.mapWith(
          Number,
        ),
    })
    .from(creditPackages)
    .where(
      and(
        eq(creditPackages.userId, order.userId),
        eq(creditPackages.status, "ACTIVE"),
        or(isNull(creditPackages.expiredAt), gt(creditPackages.expiredAt, now)),
      ),
    );
  const [entry] = await tx
    .insert(creditTransactions)
    .values({
      transNo: `PAY_${order.id}`,
      userId: order.userId,
      transType: order.kind === "SUBSCRIPTION" ? "SUBSCRIPTION" : "ORDER_PAY",
      credits: order.credits,
      balanceAfter: balance.value,
      packageId: pkg.id,
      orderNo: order.id,
      remark: `${order.provider} ${order.environment} · ${order.productName}`,
      createdAt: now,
    })
    .returning();
  const [receipt] = await tx
    .insert(paymentFulfillments)
    .values({
      orderId: order.id,
      provider: order.provider,
      environment: order.environment,
      accountId: order.accountId,
      paymentId: fact.paymentId,
      packageId: pkg.id,
      transactionId: entry.id,
    })
    .returning();
  await tx
    .update(paymentOrders)
    .set({ status: "PAID", paidAt: now, updatedAt: now })
    .where(eq(paymentOrders.id, order.id));
  return receipt;
}
export async function fulfillPayment(fact: PaymentFact) {
  const [hint] = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, fact.internalId));
  if (!hint) throw new ApiError("找不到关联订单", 404);
  return db.transaction((tx) => fulfill(tx, fact, hint));
}
export async function receivePaymentEvent(event: VerifiedEvent) {
  if (event.subscription) {
    const { receiveSubscriptionEvent } = await import("./subscriptions");
    return receiveSubscriptionEvent(event);
  }
  const scope = and(
    eq(paymentEvents.provider, event.provider),
    eq(paymentEvents.environment, event.environment),
    eq(paymentEvents.accountId, event.accountId),
    eq(paymentEvents.eventId, event.id),
  );
  let [hint] = event.internalId
    ? await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, event.internalId))
    : event.externalId
      ? await db
          .select()
          .from(paymentOrders)
          .where(
            and(
              eq(paymentOrders.provider, event.provider),
              eq(paymentOrders.environment, event.environment),
              eq(paymentOrders.accountId, event.accountId),
              eq(paymentOrders.externalId, event.externalId),
            ),
          )
      : [];
  if (event.refund) {
    const [linked] = await db
      .select({ order: paymentOrders })
      .from(paymentFulfillments)
      .innerJoin(
        paymentOrders,
        eq(paymentOrders.id, paymentFulfillments.orderId),
      )
      .where(
        and(
          eq(paymentFulfillments.provider, event.provider),
          eq(paymentFulfillments.environment, event.environment),
          eq(paymentFulfillments.accountId, event.accountId),
          eq(paymentFulfillments.paymentId, event.refund.paymentId),
        ),
      );
    hint = linked?.order;
  }
  await db
    .insert(paymentEvents)
    .values({
      provider: event.provider,
      environment: event.environment,
      accountId: event.accountId,
      eventId: event.id,
      eventType: event.type,
      normalizedEvent: event,
      orderId: hint?.id,
      status: hint ? "VERIFIED" : "IGNORED",
    })
    .onConflictDoNothing();
  if (!hint) return;
  if (
    hint.provider !== event.provider ||
    hint.environment !== event.environment ||
    hint.accountId !== event.accountId
  )
    throw new ApiError("回调订单账户不一致", 409);
  const [saved] = await db.select().from(paymentEvents).where(scope);
  if (
    event.refund &&
    event.fingerprint &&
    saved.normalizedEvent &&
    (saved.normalizedEvent as VerifiedEvent).fingerprint !== event.fingerprint
  )
    throw new ApiError("同一退款事件编号的内容不可更改", 409);
  if (saved.status === "PROCESSED") return;
  if (event.refund) {
    const { receiveRefundFact } = await import("./refunds");
    await receiveRefundFact(event.refund);
    await db
      .update(paymentEvents)
      .set({ status: "PROCESSED", processedAt: new Date() })
      .where(scope);
    return;
  }
  let fact = event.fact;
  if (
    event.provider === "paypal" &&
    hint.status !== "PAID" &&
    ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(
      event.type,
    )
  )
    fact = (await queryPaypal(snapshot(hint))) || undefined;
  await db.transaction(async (tx) => {
    if (fact) await fulfill(tx, fact, hint);
    await tx
      .update(paymentEvents)
      .set({ status: "PROCESSED", processedAt: new Date() })
      .where(scope);
  });
}
export async function recoverPaymentEvent() {
  const event = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.status, "VERIFIED"),
          lt(paymentEvents.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(asc(paymentEvents.nextAttemptAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row?.normalizedEvent) return null;
    await tx
      .update(paymentEvents)
      .set({ nextAttemptAt: new Date(Date.now() + 30000) })
      .where(
        and(
          eq(paymentEvents.provider, row.provider),
          eq(paymentEvents.environment, row.environment),
          eq(paymentEvents.accountId, row.accountId),
          eq(paymentEvents.eventId, row.eventId),
        ),
      );
    return row.normalizedEvent as VerifiedEvent;
  });
  if (!event) return false;
  await receivePaymentEvent(event);
  return true;
}

export function listOrders(userId: string, id?: string) {
  return db
    .select({
      id: paymentOrders.id,
      productName: paymentOrders.productName,
      provider: paymentOrders.provider,
      environment: paymentOrders.environment,
      amount: paymentOrders.amount,
      currency: paymentOrders.currency,
      credits: paymentOrders.credits,
      status: paymentOrders.status,
      checkoutUrl: paymentOrders.checkoutUrl,
      createdAt: paymentOrders.createdAt,
      paidAt: paymentOrders.paidAt,
      refundedAmount: paymentOrders.refundedAmount,
    })
    .from(paymentOrders)
    .where(
      and(
        eq(paymentOrders.userId, userId),
        id ? eq(paymentOrders.id, id) : undefined,
      ),
    )
    .orderBy(desc(paymentOrders.createdAt))
    .limit(30);
}
export async function refreshOrder(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.id, id), eq(paymentOrders.userId, userId)));
  if (!row) throw new ApiError("订单不存在", 404);
  if (row.status !== "PAID") {
    await db
      .update(paymentOrders)
      .set({ nextCheckAt: new Date(Date.now() - 1) })
      .where(
        and(
          eq(paymentOrders.id, id),
          lt(paymentOrders.nextCheckAt, new Date(Date.now() + 1)),
        ),
      );
    await processOrder(id);
  }
  return (await listOrders(userId, id))[0];
}
