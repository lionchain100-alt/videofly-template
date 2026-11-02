import { requireAdmin } from "@/lib/auth/admin";
import { RuntimeConsole } from "@/components/admin/runtime-console";
export const dynamic = "force-dynamic";
export default async function RuntimePage() {
  await requireAdmin();
  return <RuntimeConsole />;
}
