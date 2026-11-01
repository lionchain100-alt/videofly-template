import { SUBSCRIPTION_PRODUCTS } from "@/config/pricing-user";
import { creditCatalog } from "./catalog";
export type BillingProvider = "stripe" | "creem";
const tierNames = ["BASIC", "PRO", "ULTIMATE"];
export const subscriptionCatalog = SUBSCRIPTION_PRODUCTS.filter(
  (p) => p.enabled,
).map((p, index) => ({
  id: p.id,
  name: p.name,
  amount: Math.round(p.priceUsd * 100),
  currency: "USD",
  credits: p.credits,
  expiryDays: p.period === "year" ? 365 : 30,
  period: p.period,
  mapping: `SUB_${p.billingKey || `${tierNames[index % 3]}_${p.period === "year" ? "YEARLY" : "MONTHLY"}`}`,
}));
export function billingProduct(provider: BillingProvider, id: string) {
  const one = creditCatalog.find((p) => p.id === id);
  const sub = subscriptionCatalog.find((p) => p.id === id);
  const product = one || sub;
  if (!product) return;
  const externalId =
    process.env[
      `${provider.toUpperCase()}_${one ? (provider === "stripe" ? "PRICE_" : "PRODUCT_") + id.toUpperCase() : sub!.mapping}`
    ]?.trim();
  if (!externalId) return;
  return {
    ...product,
    kind: one ? ("PURCHASE" as const) : ("SUBSCRIPTION" as const),
    externalId,
    period: sub?.period,
    mapping: sub?.mapping,
  };
}
export function externalBillingProduct(
  provider: BillingProvider,
  externalId: string,
) {
  return [...creditCatalog, ...subscriptionCatalog]
    .map((p) => billingProduct(provider, p.id))
    .find((p) => p?.externalId === externalId);
}
