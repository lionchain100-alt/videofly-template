import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { localTestRequestAllowed } from "@/lib/auth/local-test";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (/\/(sign-in|sign-up)\/email\/?$/.test(pathname) && !localTestRequestAllowed(request.headers, true)) {
    return Response.json({ message: "Local password login is disabled or the request origin is not allowed." }, { status: 403 });
  }
  return handlers.POST(request);
}
