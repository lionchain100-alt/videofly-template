import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const auditFile = fileURLToPath(
  new URL("../.local/waffo-webhook-deliveries.jsonl", import.meta.url),
);
const server = createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url || "/", "http://127.0.0.1:3083");
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/v1/payments/return") {
    // Bring the browser back to the localhost session. Never fulfill on a return URL.
    const target = new URL("http://localhost:3000/zh/buy-credits");
    const id = url.searchParams.get("order");
    if (
      id &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
    )
      target.searchParams.set("order", id);
    res.writeHead(303, { Location: target.href, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/webhooks/waffo") {
    res.writeHead(404, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end('{"error":"Not found"}');
    return;
  }
  const audit = {
    receivedAt: new Date().toISOString(),
    eventId: null,
    eventType: null,
    status: 502,
  };
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 262144) {
        audit.status = 413;
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    try {
      const event = JSON.parse(body.toString("utf8"));
      if (typeof event.eventId === "string")
        audit.eventId = event.eventId.slice(0, 200);
      if (typeof event.eventType === "string")
        audit.eventType = event.eventType.slice(0, 200);
    } catch {}
    const headers = { "Content-Type": "application/json" };
    for (const name of ["x-waffo-signature", "x-waffo-event"]) {
      const value = req.headers[name];
      if (typeof value === "string" && value.length < 16384)
        headers[name] = value;
    }
    const upstream = await fetch("http://127.0.0.1:3000/api/webhooks/waffo", {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    audit.status = upstream.status;
    res.writeHead(upstream.status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(upstream.ok ? '{"received":true}' : '{"received":false}');
  } catch {
    if (!res.headersSent)
      res.writeHead(502, { "Content-Type": "application/json" });
    res.end('{"received":false}');
  } finally {
    // Minimal metadata only. Never log signed bodies, RSA keys, signatures or buyer information.
    await appendFile(auditFile, `${JSON.stringify(audit)}\n`).catch(() => {});
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxRequestsPerSocket = 100;
server.listen(3083, "127.0.0.1", () =>
  console.log("Waffo webhook/return proxy ready on 127.0.0.1:3083."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
