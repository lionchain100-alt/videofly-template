import { requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import { waiveRefundLoss, refundReviewSchema } from "@/services/refunds";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const admin = await requireAdminMutation(request);
    const input = refundReviewSchema.parse(
      JSON.parse(await readBounded(request, 4096)),
    );
    return apiSuccess(await waiveRefundLoss(admin.id, input));
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("请确认损失并填写至少 12 字审核原因", 400);
    return handleApiError(e);
  }
}
