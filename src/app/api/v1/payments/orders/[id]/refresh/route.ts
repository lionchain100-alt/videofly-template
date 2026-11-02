import { requireUserMutation } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { refreshOrder } from "@/services/orders";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUserMutation(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success)
      return apiError("订单编号无效", 400);
    return apiSuccess(await refreshOrder(user.id, id));
  } catch (e) {
    return handleApiError(e);
  }
}
