import { customers, db } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/payment";
import { pricingData } from "@/payment/subscriptions";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { externalBillingProduct } from "@/payment/billing-catalog";
import { stripeConfig } from "@/payment/providers/stripe";
import { listSubscriptions } from "./subscriptions";
import { reserveOrder, processOrder, listOrders } from "./orders";

export type UserSubscriptionPlan = {
  title: string;
  description: string;
  benefits: string[];
  limitations: string[];
  prices: {
    monthly: number;
    yearly: number;
  };
  stripeIds: {
    monthly: string | null;
    yearly: string | null;
  };
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeCurrentPeriodEnd: number;
  isPaid: boolean;
  interval: "month" | "year" | null;
  isCanceled?: boolean;
};

export async function createStripeSession(userId: string, planId: string) {
  stripeConfig();
  const product = externalBillingProduct("stripe", planId);
  if (!product || product.kind !== "SUBSCRIPTION")
    throw new Error("Subscription price is not configured");
  const order = await reserveOrder(userId, {
    requestId: randomUUID(),
    provider: "stripe",
    productId: product.id,
  });
  await processOrder(order.id);
  const saved = (await listOrders(userId, order.id))[0];
  return { success: !!saved?.checkoutUrl, url: saved?.checkoutUrl || null };
}

export async function getUserPlans(
  userId: string,
): Promise<UserSubscriptionPlan | undefined> {
  const [custom] = await db
    .select({
      stripeSubscriptionId: customers.stripeSubscriptionId,
      stripeCurrentPeriodEnd: customers.stripeCurrentPeriodEnd,
      stripeCustomerId: customers.stripeCustomerId,
      stripePriceId: customers.stripePriceId,
    })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  if (!custom) {
    return undefined;
  }

  const stripeSubscriptions = (await listSubscriptions(userId)).filter(
    (s) => s.provider === "stripe",
  );
  const live =
    stripeSubscriptions.find((s) => s.hasAccess) ||
    stripeSubscriptions.find(
      (s) => s.externalId === custom.stripeSubscriptionId,
    );
  if (live) {
    custom.stripeCustomerId = live.customerId;
    custom.stripeSubscriptionId = live.externalId;
    custom.stripePriceId = live.productId;
    custom.stripeCurrentPeriodEnd = live.paidThrough
      ? new Date(live.paidThrough)
      : null;
  }
  const isPaid = live
    ? live.hasAccess
    : !!custom.stripePriceId &&
      !!custom.stripeCurrentPeriodEnd &&
      custom.stripeCurrentPeriodEnd.getTime() > Date.now();

  const customPlan =
    pricingData.find(
      (plan) => plan.stripeIds.monthly === custom.stripePriceId,
    ) ??
    pricingData.find((plan) => plan.stripeIds.yearly === custom.stripePriceId);
  const plan = isPaid && customPlan ? customPlan : pricingData[0]!;

  const interval = isPaid
    ? customPlan?.stripeIds.monthly === custom.stripePriceId
      ? "month"
      : customPlan?.stripeIds.yearly === custom.stripePriceId
        ? "year"
        : null
    : null;

  let isCanceled = live?.cancelAtPeriodEnd || false;
  if (!live && isPaid && custom.stripeSubscriptionId) {
    const stripePlan = await stripe.subscriptions.retrieve(
      custom.stripeSubscriptionId,
    );
    isCanceled = stripePlan.cancel_at_period_end;
  }

  return {
    ...plan,
    ...custom,
    stripeCurrentPeriodEnd: custom.stripeCurrentPeriodEnd?.getTime() ?? 0,
    isPaid,
    interval,
    isCanceled,
  };
}

export async function getMySubscription(userId: string) {
  const [customer] = await db
    .select({
      plan: customers.plan,
      stripeCurrentPeriodEnd: customers.stripeCurrentPeriodEnd,
    })
    .from(customers)
    .where(eq(customers.authUserId, userId))
    .limit(1);

  if (!customer) return null;
  const current = (await listSubscriptions(userId)).filter(
    (s) => s.provider === "stripe",
  );
  if (current.length) {
    const paid = current
      .filter((s) => s.hasAccess)
      .sort(
        (a, b) =>
          new Date(b.paidThrough!).getTime() -
          new Date(a.paidThrough!).getTime(),
      )[0];
    return {
      plan: paid ? "PRO" : "FREE",
      endsAt: paid?.paidThrough ? new Date(paid.paidThrough) : null,
    };
  }
  return {
    plan:
      customer.stripeCurrentPeriodEnd &&
      customer.stripeCurrentPeriodEnd > new Date()
        ? customer.plan
        : "FREE",
    endsAt: customer.stripeCurrentPeriodEnd,
  };
}
