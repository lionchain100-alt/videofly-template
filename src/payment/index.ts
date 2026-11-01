import Stripe from "stripe";
export { handleEvent } from "./webhooks";
export type { Stripe };
let current: { key: string; client: Stripe } | undefined;
export function getStripe() {
  const key = process.env.STRIPE_API_KEY;
  if (!key) throw new Error("STRIPE_API_KEY is not configured");
  if (current?.key !== key)
    current = {
      key,
      client: new Stripe(key, {
        apiVersion: "2026-10-28.endive",
        timeout: 15000,
        maxNetworkRetries: 0,
      }),
    };
  return current.client;
}
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getStripe(), prop);
  },
});
