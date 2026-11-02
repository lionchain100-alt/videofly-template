import { subscriptionCatalog, billingProduct } from "./billing-catalog";
export interface SubscriptionPlan {
  title: string;
  description: string;
  benefits: string[];
  limitations: string[];
  prices: { monthly: number; yearly: number };
  stripeIds: { monthly: string | null; yearly: string | null };
}
const free: SubscriptionPlan = {
  title: "Free",
  description: "Free plan",
  benefits: [],
  limitations: [],
  prices: { monthly: 0, yearly: 0 },
  stripeIds: { monthly: null, yearly: null },
};
export const pricingData: SubscriptionPlan[] = [
  free,
  ...subscriptionCatalog
    .filter((p) => p.period === "month")
    .map((p) => {
      const year = subscriptionCatalog.find(
        (y) => y.mapping === p.mapping.replace("MONTHLY", "YEARLY"),
      );
      return {
        title: p.name,
        description: p.name,
        benefits: [p.credits + " credits per month"],
        limitations: [],
        prices: { monthly: p.amount / 100, yearly: (year?.amount || 0) / 100 },
        stripeIds: {
          monthly: billingProduct("stripe", p.id)?.externalId || null,
          yearly: year
            ? billingProduct("stripe", year.id)?.externalId || null
            : null,
        },
      };
    }),
];
