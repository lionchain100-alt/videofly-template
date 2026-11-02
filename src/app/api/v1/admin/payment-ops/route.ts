import { z } from "zod";
import { requireAdmin, requireAdminMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import {
  paymentOperationSchema,
  paymentOperation,
  processPaymentOperation,
  getPaymentOperation,
  paymentOpsQuerySchema,
  listPaymentOperations,
} from "@/services/payment-operations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    if (params.has("requestId"))
      return apiSuccess(
        await getPaymentOperation(
          z.string().uuid().parse(params.get("requestId")),
        ),
      );
    return apiSuccess(
      await listPaymentOperations(
        paymentOpsQuerySchema.parse(Object.fromEntries(params)),
      ),
    );
  } catch (e) {
    if (e instanceof z.ZodError) return apiError("查询参数无效", 400);
    return handleApiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdminMutation(request);
    const input = paymentOperationSchema.parse(
      JSON.parse(await readBounded(request, 4096)),
    );
    const op = await paymentOperation(actor.id, input);
    if (op.status === "QUEUED" || op.status === "RUNNING")
      await processPaymentOperation(op.id);
    return apiSuccess(await getPaymentOperation(input.requestId), 202);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError(
        "操作参数无效：须有原对象标识、请求编号及 12–300 字原因，不能提交支付事实或改金额",
        400,
      );
    return handleApiError(e);
  }
}
