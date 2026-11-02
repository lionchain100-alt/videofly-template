import { paypalConfig, createPaypalCheckout, queryPaypal } from "./paypal";
import { waffoConfig, createWaffoCheckout, queryWaffo } from "./waffo";
import { stripeConfig, createStripeCheckout, stripePayment } from "./stripe";
import { creemConfig, createCreemCheckout, creemPayment } from "./creem";
import type { PaymentProvider, OrderSnapshot } from "./types";
export const paymentProviders = ["paypal", "waffo", "stripe", "creem"] as const;
export function paymentConfig(provider: PaymentProvider) {
  switch (provider) {
    case "paypal":
      return paypalConfig();
    case "waffo":
      return waffoConfig();
    case "stripe":
      return stripeConfig();
    case "creem":
      return creemConfig();
  }
}
export function createCheckout(order: OrderSnapshot, userId: string) {
  switch (order.provider) {
    case "paypal":
      return createPaypalCheckout(order);
    case "waffo":
      return createWaffoCheckout(order);
    case "stripe":
      return createStripeCheckout(order, userId);
    case "creem":
      return createCreemCheckout(order, userId);
  }
}
export async function queryCheckout(order: OrderSnapshot) {
  if (!order.externalId) return;
  switch (order.provider) {
    case "paypal":
      return queryPaypal(order);
    case "waffo":
      await queryWaffo(order);
      return;
    case "stripe":
      return stripePayment(order.externalId);
    case "creem":
      return creemPayment(order.externalId);
  }
}
