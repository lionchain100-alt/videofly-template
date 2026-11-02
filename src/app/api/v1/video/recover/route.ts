import { requireAdmin, requireAdminMutation } from "@/lib/api/auth";
import { apiError, handleApiError } from "@/lib/api/response";
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return apiError("旧版恢复入口已停用，请在后台任务详情中核实视频任务", 410);
  } catch (e) {
    return handleApiError(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    return apiError("旧版任意结果地址恢复已停用，请在后台核实 Kie 任务或重试保存", 410);
  } catch (e) {
    return handleApiError(e);
  }
}
