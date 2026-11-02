import { getLocale } from "next-intl/server";
import { PurchaseWorkspace } from "@/components/credits/purchase-workspace";
import { SubscriptionWorkspace } from "@/components/credits/subscription-workspace";
export async function PricingSection() {
  return (
    <>
      <PurchaseWorkspace locale={await getLocale()} />
      <SubscriptionWorkspace />
    </>
  );
}
