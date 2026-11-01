import { PurchaseWorkspace } from "@/components/credits/purchase-workspace";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "购买积分",
  robots: { index: false, follow: false },
};
export default async function BuyCreditsPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  return <PurchaseWorkspace locale={(await params).locale} />;
}
