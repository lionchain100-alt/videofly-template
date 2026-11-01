export type PaymentProvider = "paypal" | "waffo" | "stripe" | "creem";
export type OrderSnapshot = {
  id: string;
  provider: PaymentProvider;
  environment: string;
  accountId: string;
  amount: number;
  currency: string;
  credits: number;
  expiryDays: number;
  productId: string;
  productName: string;
  externalId: string | null;
  kind?: string;
  providerProductId?: string | null;
};
export type PaymentFact = {
  internalId: string;
  externalId: string;
  paymentId: string;
  accountId: string;
  environment: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
};
export type VerifiedEvent = {
  fingerprint?: string;
  id: string;
  type: string;
  provider: PaymentProvider;
  environment: string;
  accountId: string;
  internalId?: string;
  externalId?: string;
  fact?: PaymentFact;
  refund?: RefundFact;
  subscription?: SubscriptionFact;
};
export type SubscriptionFact = {
  provider: "stripe" | "creem";
  environment: string;
  accountId: string;
  externalId: string;
  customerId: string;
  userId?: string;
  checkoutOrderId?: string;
  productId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodStart: string;
  periodEnd: string;
  observedAt: string;
  payment?: {
    id: string;
    amount: number;
    currency: string;
    periodStart: string;
    periodEnd: string;
  };
};
export type RefundFact = {
  provider: PaymentProvider;
  environment: string;
  accountId: string;
  paymentId: string;
  externalId: string;
  providerRefundId?: string;
  reference?: string;
  amount: number;
  currency: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
};
export type RefundRequest = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  environment: string;
  accountId: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
  externalId: string | null;
  ticketId: string | null;
};
export function cents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid provider amount");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function decimal(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
