import { requireAdmin } from "@/lib/api/auth";
import { apiSuccess, apiError, handleApiError } from "@/lib/api/response";
import { refundView } from "@/services/refunds";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success)
      return apiError("订单 ID 无效", 400);
    const r = apiSuccess(await refundView(id));
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  } catch (e) {
    return handleApiError(e);
  }
}
