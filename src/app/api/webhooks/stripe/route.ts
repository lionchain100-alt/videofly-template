import { verifyStripe } from "@/payment/providers/stripe";
import { readBounded } from "@/payment/providers/http";
import { receivePaymentEvent } from "@/services/orders";
import { ApiError } from "@/lib/api/error";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await receivePaymentEvent(
      await verifyStripe(request, await readBounded(request)),
    );
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
