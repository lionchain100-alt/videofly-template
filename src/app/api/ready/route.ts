import { runtimeHealth } from "@/services/runtime-health";
export const dynamic = "force-dynamic";
export async function GET() {
  const result = await runtimeHealth();
  return Response.json(
    {
      status: result.ready ? "ready" : "not_ready",
      checks: result.checks,
      checkedAt: result.checkedAt,
    },
    {
      status: result.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
