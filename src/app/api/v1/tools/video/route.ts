import { videoSubmissionSchema } from "@/tools/video/contract";
import { publicVideoConfig } from "@/ai/kie-video";
import { requireUserMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { submitVideo } from "@/services/video-jobs";
import { z } from "zod";
import { assertToolEnabled } from "@/config/site-server";
import { publicGovernedConfig } from "@/services/ai-governance";
export const dynamic = "force-dynamic";
export async function GET() {
  return apiSuccess(
    await publicGovernedConfig("video-generation", publicVideoConfig()),
  );
}
export async function POST(request: Request) {
  try {
    const user = await requireUserMutation(request);
    await assertToolEnabled("video-generation");
    const reader = request.body?.getReader();
    if (!reader) return apiError("缺少输入", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8000) {
        await reader.cancel();
        return apiError("输入过长", 413);
      }
      chunks.push(value);
    }
    const data = videoSubmissionSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const result = await submitVideo(
      user.id,
      data.requestId,
      data.input,
      data.policyRevision,
    );
    return apiSuccess(result, result.replayed ? 200 : 202);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("请填写 10–1500 字提示词、允许的比例和有效请求编号", 400);
    return handleApiError(e);
  }
}
