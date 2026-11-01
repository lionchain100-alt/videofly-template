import { z } from "zod";
import { requireAdminMutation } from "@/lib/api/auth";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { grantCredits, grantSchema } from "@/services/admin-operations";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminMutation(request);
    const input = grantSchema.parse(await request.json());
    return apiSuccess(await grantCredits(admin.id, input));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return apiError(
        "请填写目标用户、1–100000 整数积分、1–3650 天有效期、3–300 字原因和有效请求编号",
        400,
      );
    return handleApiError(error);
  }
}
