import { z } from "zod";
export const dynamic = "force-dynamic";
// This route only brings the browser home. It never captures money or grants credits.
// On local HTTPS tunnels it returns to localhost, where the local-only auth session lives.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("order");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const target = new URL("/zh/buy-credits", base);
  if (z.string().uuid().safeParse(id).success)
    target.searchParams.set("order", id!);
  if (params.get("cancelled") === "1")
    target.searchParams.set("cancelled", "1");
  return new Response(null, {
    status: 303,
    headers: { Location: target.href, "Cache-Control": "no-store" },
  });
}
