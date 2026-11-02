import { requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { videoReviewSchema, reviewVideo } from "@/services/video-review";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request);
    const text = await request.text();
    if (text.length > 4096) return apiError("请求过长", 413);
    const input = videoReviewSchema.parse(JSON.parse(text));
    return apiSuccess(await reviewVideo(actor.id, input));
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("请填写完整操作、请求编号及 12–300 字核实依据", 400);
    return handleApiError(e);
  }
}
