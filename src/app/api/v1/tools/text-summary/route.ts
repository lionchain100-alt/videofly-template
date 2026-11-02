import { z } from "zod";
import { requireUserMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { publicTextConfig } from "@/ai/text-provider";
import { summarySubmissionSchema } from "@/tools/text-summary/contract";
import { submitSummary } from "@/services/tasks";
import { assertToolEnabled } from "@/config/site-server";
import { publicGovernedConfig } from "@/services/ai-governance";

export const dynamic = "force-dynamic";
export async function GET() {
  return apiSuccess(
    await publicGovernedConfig("text-summary", publicTextConfig()),
  );
}
export async function POST(request: Request) {
  try {
    const user = await requireUserMutation(request);
    await assertToolEnabled("text-summary");
    const reader = request.body?.getReader();
    if (!reader) return apiError("缺少输入", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 36000) {
        await reader.cancel();
        return apiError("输入过长", 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await submitSummary(
      user.id,
      summarySubmissionSchema.parse(body),
    );
    return apiSuccess(result, result.replayed ? 200 : 202);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError(
        "请输入 20–8000 字原文、摘要长度、语言和有效请求编号",
        400,
      );
    return handleApiError(e);
  }
}
