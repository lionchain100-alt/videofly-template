import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { localTestRequestAllowed } from "@/lib/auth/local-test";

const handlers = toNextJsHandler(auth);
export async function GET(request: Request) {
  const match = new URL(request.url).pathname.match(/\/creem\/([^/]+)\/?$/);
  if (match) {
    if (match[1] === "webhook") return new Response(null, { status: 405 });
    const { legacyCreem } = await import("@/payment/legacy-creem");
    return legacyCreem(request, match[1]);
  }
  return handlers.GET(request);
}
export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/creem/webhook")) {
    const { POST } = await import("@/app/api/webhooks/creem/route");
    return POST(request);
  }
  const match = pathname.match(/\/creem\/([^/]+)\/?$/);
  if (match) {
    const { legacyCreem } = await import("@/payment/legacy-creem");
    return legacyCreem(request, match[1]);
  }
  if (
    /\/(sign-in|sign-up)\/email\/?$/.test(pathname) &&
    !localTestRequestAllowed(request.headers, true)
  ) {
    return Response.json(
      {
        message:
          "Local password login is disabled or the request origin is not allowed.",
      },
      { status: 403 },
    );
  }
  return handlers.POST(request);
}
