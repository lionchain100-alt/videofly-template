import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, gte, lt } from "drizzle-orm";
import {
  db,
  users,
  paymentOrders,
  paymentEvents,
  paymentFulfillments,
  billingSubscriptions,
  billingCycles,
  customers,
  creemSubscriptions,
  creditPackages,
  creditTransactions,
} from "@/db";
import { ApiError } from "@/lib/api/error";
import { externalBillingProduct } from "@/payment/billing-catalog";
import { paymentConfig } from "@/payment/providers/registry";
import { changeStripeSubscription } from "@/payment/providers/stripe";
import { changeCreemSubscription } from "@/payment/providers/creem";
import type {
  SubscriptionFact,
  VerifiedEvent,
} from "@/payment/providers/types";
import { fulfill } from "./orders";
const date = (s: string) => {
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) throw new ApiError("订阅日期无效", 409);
  return d;
};
const canonical = (v: any): string =>
  v && typeof v === "object"
    ? Array.isArray(v)
      ? `[${v.map(canonical)}]`
      : `{${Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
          .join(",")}}`
    : JSON.stringify(v);
export async function receiveSubscriptionEvent(event: VerifiedEvent) {
  const fact = event.subscription!;
  if (
    fact.provider !== event.provider ||
    fact.environment !== event.environment ||
    fact.accountId !== event.accountId
  )
    throw new ApiError("订阅通知账户不一致", 409);
  const c = paymentConfig(fact.provider);
  if (c.accountId !== fact.accountId || c.environment !== fact.environment)
    throw new ApiError("订阅账户配置已变化", 409);
  const product = externalBillingProduct(fact.provider, fact.productId);
  if (!product || product.kind !== "SUBSCRIPTION")
    throw new ApiError("订阅产品未映射", 409);
  const start = date(fact.periodStart),
    end = date(fact.periodEnd),
    observed = date(fact.observedAt);
  if (
    end <= start ||
    !fact.externalId ||
    !fact.customerId ||
    ![
      "active",
      "trialing",
      "scheduled_cancel",
      "canceled",
      "paused",
      "past_due",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "expired",
    ].includes(fact.status)
  )
    throw new ApiError("订阅状态或周期无效", 409);
  const scope = and(
    eq(paymentEvents.provider, event.provider),
    eq(paymentEvents.environment, event.environment),
    eq(paymentEvents.accountId, event.accountId),
    eq(paymentEvents.eventId, event.id),
  );
  await db
    .insert(paymentEvents)
    .values({
      provider: event.provider,
      environment: event.environment,
      accountId: event.accountId,
      eventId: event.id,
      eventType: event.type,
      normalizedEvent: event,
      status: "VERIFIED",
    })
    .onConflictDoNothing();
  return db.transaction(async (tx) => {
    const subScope = and(
      eq(billingSubscriptions.provider, fact.provider),
      eq(billingSubscriptions.environment, fact.environment),
      eq(billingSubscriptions.accountId, fact.accountId),
      eq(billingSubscriptions.externalId, fact.externalId),
    );
    let [existing] = await tx
      .select()
      .from(billingSubscriptions)
      .where(subScope);
    const [checkout] = fact.checkoutOrderId
      ? await tx
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.id, fact.checkoutOrderId))
      : [];
    const [legacy] =
      fact.provider === "stripe"
        ? await tx
            .select({ userId: customers.authUserId })
            .from(customers)
            .where(eq(customers.stripeSubscriptionId, fact.externalId))
        : await tx
            .select({ userId: creemSubscriptions.userId })
            .from(creemSubscriptions)
            .where(eq(creemSubscriptions.subscriptionId, fact.externalId));
    const owner =
      existing?.userId || checkout?.userId || legacy?.userId || fact.userId;
    if (!owner)
      throw new ApiError("订阅尚未关联本站用户，等待原始收银台通知", 409);
    if (fact.userId && fact.userId !== owner)
      throw new ApiError("订阅用户关联冲突", 409);
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, owner))
      .for("update");
    if (!user) throw new ApiError("订阅用户不存在", 409);
    const [saved] = await tx
      .select()
      .from(paymentEvents)
      .where(scope)
      .for("update");
    const stored = saved.normalizedEvent as VerifiedEvent;
    if (
      event.fingerprint && stored.fingerprint
        ? event.fingerprint !== stored.fingerprint
        : canonical(stored) !== canonical(JSON.parse(JSON.stringify(event)))
    )
      throw new ApiError("同一事件编号的内容已变化", 409);
    if (saved.status === "PROCESSED") return;
    [existing] = await tx.select().from(billingSubscriptions).where(subScope);
    if (
      existing &&
      (existing.userId !== owner || existing.customerId !== fact.customerId)
    )
      throw new ApiError("订阅归属冲突", 409);
    if (
      checkout &&
      (checkout.userId !== owner ||
        checkout.kind !== "SUBSCRIPTION" ||
        checkout.provider !== fact.provider ||
        checkout.environment !== fact.environment ||
        checkout.accountId !== fact.accountId ||
        checkout.providerProductId !== fact.productId)
    )
      throw new ApiError("订阅与原始订单不匹配", 409);
    if (!existing) {
      [existing] = await tx
        .insert(billingSubscriptions)
        .values({
          id: randomUUID(),
          userId: owner,
          provider: fact.provider,
          environment: fact.environment,
          accountId: fact.accountId,
          externalId: fact.externalId,
          customerId: fact.customerId,
          productId: fact.productId,
          status: fact.status,
          cancelAtPeriodEnd: fact.cancelAtPeriodEnd,
          periodStart: start,
          periodEnd: end,
          observedAt: observed,
        })
        .returning();
    } else if (observed >= existing.observedAt) {
      [existing] = await tx
        .update(billingSubscriptions)
        .set({
          productId: fact.productId,
          status: fact.status,
          cancelAtPeriodEnd: fact.cancelAtPeriodEnd,
          periodStart: start,
          periodEnd: end,
          observedAt: observed,
          updatedAt: new Date(),
        })
        .where(eq(billingSubscriptions.id, existing.id))
        .returning();
    }
    if (fact.payment) {
      const paid = fact.payment,
        ps = date(paid.periodStart),
        pe = date(paid.periodEnd);
      if (
        !paid.id ||
        paid.amount !== product.amount ||
        paid.currency !== product.currency ||
        pe <= ps
      )
        throw new ApiError("订阅账单金额、币种或周期不符", 409);
      const [cycle] = await tx
        .select()
        .from(billingCycles)
        .where(
          and(
            eq(billingCycles.subscriptionId, existing.id),
            eq(billingCycles.periodStart, ps),
            eq(billingCycles.periodEnd, pe),
          ),
        );
      if (cycle && cycle.paymentId !== paid.id)
        throw new ApiError("同一期订阅出现另一笔收款，需要人工核实", 409);
      if (!cycle) {
        const [overlap] = await tx
          .select({ id: billingCycles.orderId })
          .from(billingCycles)
          .where(
            and(
              eq(billingCycles.subscriptionId, existing.id),
              lt(billingCycles.periodStart, pe),
              sql`${billingCycles.periodEnd}>${ps.toISOString()}::timestamptz`,
            ),
          )
          .limit(1);
        if (overlap)
          throw new ApiError("订阅账单周期与已发放周期重叠，需要人工核实", 409);
        const [prior] = await tx
          .select()
          .from(billingCycles)
          .where(eq(billingCycles.orderId, checkout?.id || ""));
        let order = checkout && !prior ? checkout : undefined;
        if (!order) {
          [order] = await tx
            .insert(paymentOrders)
            .values({
              id: randomUUID(),
              userId: owner,
              requestId: `subscription:${fact.provider}:${fact.environment}:${fact.accountId}:${paid.id}`,
              provider: fact.provider,
              environment: fact.environment,
              accountId: fact.accountId,
              kind: "SUBSCRIPTION",
              providerProductId: fact.productId,
              productId: product.id,
              productName: product.name,
              amount: product.amount,
              currency: product.currency,
              credits: product.credits,
              expiryDays: product.expiryDays,
              externalId: `${fact.externalId}:${paid.id}`,
              status: "PENDING",
            })
            .returning();
        }
        if (order.amount !== paid.amount || order.currency !== paid.currency)
          throw new ApiError("原始订阅订单价格不符", 409);
        const oldKeys =
          fact.provider === "creem"
            ? [
                `creem_sub_${fact.externalId}`,
                `creem_sub_${fact.customerId}`,
                `creem_${paid.id}`,
              ]
            : [];
        const [oldPackage] = oldKeys.length
          ? await tx
              .select()
              .from(creditPackages)
              .where(
                and(
                  eq(creditPackages.userId, owner),
                  inArray(creditPackages.orderNo, oldKeys),
                  gte(creditPackages.createdAt, ps),
                  lt(creditPackages.createdAt, pe),
                ),
              )
          : [];
        if (oldPackage) {
          const [entry] = await tx
            .select()
            .from(creditTransactions)
            .where(
              and(
                eq(creditTransactions.packageId, oldPackage.id),
                sql`${creditTransactions.credits}>0`,
              ),
            );
          if (!entry || oldPackage.initialCredits !== order.credits)
            throw new ApiError("旧订阅积分记录需要人工核对", 409);
          await tx.insert(paymentFulfillments).values({
            orderId: order.id,
            provider: fact.provider,
            environment: fact.environment,
            accountId: fact.accountId,
            paymentId: paid.id,
            packageId: oldPackage.id,
            transactionId: entry.id,
          });
          await tx
            .update(paymentOrders)
            .set({
              status: "PAID",
              paidAt: oldPackage.createdAt,
              updatedAt: new Date(),
            })
            .where(eq(paymentOrders.id, order.id));
        } else
          await fulfill(
            tx,
            {
              provider: fact.provider,
              environment: fact.environment,
              accountId: fact.accountId,
              internalId: order.id,
              externalId: order.externalId!,
              paymentId: paid.id,
              amount: paid.amount,
              currency: paid.currency,
            },
            order,
            pe,
          );
        await tx.insert(billingCycles).values({
          subscriptionId: existing.id,
          periodStart: ps,
          periodEnd: pe,
          paymentId: paid.id,
          orderId: order.id,
        });
      }
    }
    const [coverage] = await tx
      .select({ end: sql<Date | null>`max(${billingCycles.periodEnd})` })
      .from(billingCycles)
      .where(eq(billingCycles.subscriptionId, existing.id));
    const covered = coverage.end && new Date(coverage.end) > new Date(),
      access =
        !!covered &&
        ["active", "trialing", "scheduled_cancel", "past_due"].includes(
          existing.status,
        );
    if (fact.provider === "stripe")
      await tx
        .update(customers)
        .set({
          stripeCustomerId: fact.customerId,
          stripeSubscriptionId: fact.externalId,
          stripePriceId: existing.productId,
          stripeCurrentPeriodEnd: coverage.end ? new Date(coverage.end) : null,
          plan: access
            ? product.mapping?.includes("ULTIMATE")
              ? "BUSINESS"
              : "PRO"
            : "FREE",
          updatedAt: new Date(),
        })
        .where(eq(customers.authUserId, owner));
    else
      await tx
        .insert(creemSubscriptions)
        .values({
          userId: owner,
          productId: existing.productId,
          subscriptionId: fact.externalId,
          status: access
            ? "active"
            : existing.status === "active"
              ? "pending"
              : existing.status,
          currentPeriodEnd: coverage.end ? new Date(coverage.end) : null,
        })
        .onConflictDoUpdate({
          target: creemSubscriptions.subscriptionId,
          set: {
            productId: existing.productId,
            status: access
              ? "active"
              : existing.status === "active"
                ? "pending"
                : existing.status,
            currentPeriodEnd: coverage.end ? new Date(coverage.end) : null,
            updatedAt: new Date(),
          },
        });
    await tx
      .update(paymentEvents)
      .set({ status: "PROCESSED", processedAt: new Date() })
      .where(scope);
  });
}
export async function listSubscriptions(userId: string) {
  const rows = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId));
  return Promise.all(
    rows.map(async (row) => {
      const [coverage] = await db
        .select({ end: sql<Date | null>`max(${billingCycles.periodEnd})` })
        .from(billingCycles)
        .where(eq(billingCycles.subscriptionId, row.id));
      return {
        ...row,
        productName:
          externalBillingProduct(
            row.provider as "stripe" | "creem",
            row.productId,
          )?.name || "订阅方案",
        paidThrough: coverage.end,
        hasAccess:
          !!coverage.end &&
          new Date(coverage.end) > new Date() &&
          ["active", "trialing", "scheduled_cancel", "past_due"].includes(
            row.status,
          ),
      };
    }),
  );
}
export async function changeSubscription(
  userId: string,
  id: string,
  action: "cancel" | "resume",
) {
  const [row] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.id, id),
      ),
    );
  if (!row) throw new ApiError("订阅不存在", 404);
  const c = paymentConfig(row.provider as "stripe" | "creem");
  if (c.accountId !== row.accountId || c.environment !== row.environment)
    throw new ApiError("订阅账户配置不一致", 409);
  const fact =
    row.provider === "stripe"
      ? await changeStripeSubscription(row.externalId, action)
      : await changeCreemSubscription(row.externalId, action);
  await receiveSubscriptionEvent({
    id: `local:${id}:${randomUUID()}`,
    type: `subscription.${action}.verified`,
    provider: fact.provider,
    environment: fact.environment,
    accountId: fact.accountId,
    subscription: fact,
  });
  return listSubscriptions(userId);
}
