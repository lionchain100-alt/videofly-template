import { requireAdmin } from "@/lib/auth/admin";
import { AiGovernanceConsole } from "@/components/admin/ai-governance-console";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdmin();
  return <AiGovernanceConsole />;
}
