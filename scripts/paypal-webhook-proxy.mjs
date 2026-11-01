import { createServer } from "node:http";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const auditFile = fileURLToPath(
  new URL("../.local/paypal-webhook-deliveries.jsonl", import.meta.url),
);
const allowedHeaders = [
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
];
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/webhooks/paypal") {
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
    transmissionId: null,
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
      if (typeof event.id === "string") audit.eventId = event.id.slice(0, 200);
      if (typeof event.event_type === "string")
        audit.eventType = event.event_type.slice(0, 200);
    } catch {
      /* Invalid JSON is rejected by the authenticated application handler. */
    }
    const headers = { "Content-Type": "application/json" };
    for (const name of allowedHeaders) {
      const value = req.headers[name];
      if (typeof value === "string" && value.length < 16384)
        headers[name] = value;
    }
    audit.transmissionId =
      typeof req.headers["paypal-transmission-id"] === "string"
        ? req.headers["paypal-transmission-id"].slice(0, 200)
        : null;
    const upstream = await fetch("http://127.0.0.1:3000/api/webhooks/paypal", {
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
    // Delivery identifiers/status only. Never persist signatures, bodies or payer data.
    await appendFile(auditFile, `${JSON.stringify(audit)}\n`).catch(() => {});
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxRequestsPerSocket = 100;
server.listen(3081, "127.0.0.1", () =>
  console.log("PayPal-only webhook proxy ready on 127.0.0.1:3081."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
