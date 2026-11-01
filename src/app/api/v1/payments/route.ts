import { requireUserMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import {
  listOrders,
  publicPayments,
  purchaseSchema,
  reserveOrder,
  processOrder,
} from "@/services/orders";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET() {
  return apiSuccess(publicPayments());
}
export async function POST(request: Request) {
  try {
    const user = await requireUserMutation(request);
    const input = purchaseSchema.parse(
      JSON.parse(await readBounded(request, 4096)),
    );
    const order = await reserveOrder(user.id, input);
    await processOrder(order.id);
    return apiSuccess({ order: (await listOrders(user.id, order.id))[0] }, 202);
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return apiError("购买参数无效", 400);
    return handleApiError(e);
  }
}
