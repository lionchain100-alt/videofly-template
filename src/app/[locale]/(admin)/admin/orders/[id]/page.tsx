import { requireAdmin } from "@/lib/auth/admin";
import { RefundConsole } from "@/components/admin/refund-console";
export const dynamic = "force-dynamic";
export default async function OrderDetail({
  params,
}: { params: Promise<{ id: string; locale: string }> }) {
  await requireAdmin();
  const { id, locale } = await params;
  return <RefundConsole key={id} orderId={id} locale={locale} />;
}
