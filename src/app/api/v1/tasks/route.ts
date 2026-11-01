import { requireAuth } from "@/lib/api/auth";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { listSummaryTasks } from "@/services/tasks";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    const response = apiSuccess({ userId: user.id, tasks: await listSummaryTasks(user.id) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return handleApiError(e);
  }
}
