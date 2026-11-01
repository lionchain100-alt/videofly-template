// Prices are integer US cents. Provider product IDs never define the credit balance.
export const creditCatalog = [
  {
    id: "starter",
    name: "入门积分包",
    amount: 500,
    currency: "USD",
    credits: 100,
    expiryDays: 365,
  },
  {
    id: "standard",
    name: "标准积分包",
    amount: 1500,
    currency: "USD",
    credits: 350,
    expiryDays: 365,
  },
] as const;
