import { requireAuth, requireUserMutation } from "@/lib/api/auth";
import { apiError, apiSuccess, handleApiError } from "@/lib/api/response";
import { readBounded } from "@/payment/providers/http";
import {
  listSubscriptions,
  changeSubscription,
} from "@/services/subscriptions";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return apiSuccess(await listSubscriptions((await requireAuth(request)).id));
  } catch (e) {
    return handleApiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUserMutation(request);
    const input = z
      .object({ id: z.string().uuid(), action: z.enum(["cancel", "resume"]) })
      .strict()
      .parse(JSON.parse(await readBounded(request, 4096)));
    return apiSuccess(
      await changeSubscription(user.id, input.id, input.action),
    );
  } catch (e) {
    return e instanceof z.ZodError || e instanceof SyntaxError
      ? apiError("订阅编号或操作无效", 400)
      : handleApiError(e);
  }
}
