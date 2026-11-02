import { z } from "zod";
import { requireAdmin, requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import {
  aiGovernanceOverview,
  saveAiPolicy,
  reviewAiCost,
} from "@/services/ai-governance";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return apiSuccess(await aiGovernanceOverview());
  } catch (e) {
    return handleApiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request),
      reader = request.body?.getReader();
    if (!reader) return apiError("缺少配置", 400);
    let size = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) {
        await reader.cancel();
        return apiError("配置内容过大", 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const { action, ...command } = body;
    if (action === "policy")
      return apiSuccess(await saveAiPolicy(actor.id, command));
    if (action === "review")
      return apiSuccess(await reviewAiCost(actor.id, command));
    return apiError("无效操作", 400);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("模型、预算或审计配置无效，请检查参数和原因", 400);
    return handleApiError(e);
  }
}
