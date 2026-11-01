import { requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import {
  createRefund,
  processRefund,
  refundSchema,
  refundView,
} from "@/services/refunds";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request);
    const input = refundSchema.parse(
      JSON.parse(await readBounded(request, 4096)),
    );
    const r = await createRefund(actor.id, input);
    if (r.status === "QUEUED") await processRefund(r.id);
    return apiSuccess(await refundView(r.orderId), 202);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("退款参数无效：金额需为正整数美分，原因至少 6 字", 400);
    return handleApiError(e);
  }
}
