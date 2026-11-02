import { requireAdmin } from "@/lib/auth/admin";
import { PaymentOperationsConsole } from "@/components/admin/payment-operations-console";
export const dynamic = "force-dynamic";
export default async function PaymentOperationsPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  await requireAdmin();
  const { locale } = await params;
  return <PaymentOperationsConsole locale={locale} />;
}
