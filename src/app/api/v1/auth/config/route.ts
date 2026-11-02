import { productionAuthConfig } from "@/lib/auth/production-config";
import { localTestRequestAllowed } from "@/lib/auth/local-test";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  return Response.json(
    { ...productionAuthConfig(), local: localTestRequestAllowed(r.headers) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
