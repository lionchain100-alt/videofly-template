import { requireUserMutation } from "@/lib/api/auth";
import { apiError, handleApiError } from "@/lib/api/response";
export async function POST(request: Request) {
  try {
    await requireUserMutation(request);
    return apiError("旧版视频提交入口已停用，请使用 /api/v1/tools/video 的持久化任务流程", 410);
  } catch (e) {
    return handleApiError(e);
  }
}
