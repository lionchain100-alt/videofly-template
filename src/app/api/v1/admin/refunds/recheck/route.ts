import { requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import { recheckRefund } from "@/services/refunds";
import { z } from "zod";
export const dynamic = "force-dynamic";
const schema = z
  .object({
    refundId: z.string().uuid(),
    externalId: z
      .string()
      .regex(/^[A-Za-z0-9_]{5,100}$/)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const admin = await requireAdminMutation(request);
    const input = schema.parse(JSON.parse(await readBounded(request, 4096)));
    await recheckRefund(admin.id, input.refundId, input.externalId);
    return apiSuccess({ checked: true });
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("退款编号格式无效", 400);
    return handleApiError(e);
  }
}
