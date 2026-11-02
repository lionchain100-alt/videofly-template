import { verifyWaffo } from "@/payment/providers/waffo";
import { readBounded } from "@/payment/providers/http";
import { receivePaymentEvent } from "@/services/orders";
import { ApiError } from "@/lib/api/error";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const event = verifyWaffo(request, await readBounded(request));
    await receivePaymentEvent(event);
    return Response.json({ received: true });
  } catch (e) {
    return Response.json(
      { received: false },
      {
        status:
          e instanceof ApiError ? (e.status === 409 ? 500 : e.status) : 500,
      },
    );
  }
}
