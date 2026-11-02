import { requireAdmin } from "@/lib/api/auth";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { runtimeHealth } from "@/services/runtime-health";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return apiSuccess(await runtimeHealth());
  } catch (e) {
    return handleApiError(e);
  }
}
