import { requireAuth } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { getVideoTask } from "@/services/video-jobs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(request);
    const task = await getVideoTask(user.id, (await params).id);
    const response = task ? apiSuccess(task) : apiError("任务不存在", 404);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return handleApiError(e);
  }
}
