import type Stripe from "stripe";
/** Legacy export; financial events enter through the signed raw-body HTTP adapter. */
export async function handleEvent(_event: Stripe.Event) {
  throw new Error(
    "Use the signed Stripe webhook route; unsigned event objects cannot grant credits",
  );
}
