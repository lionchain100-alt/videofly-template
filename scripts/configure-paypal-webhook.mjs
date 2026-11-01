import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
const root = new URL("../", import.meta.url);
const envPath = new URL(".env.local", root);
const recordPath = new URL(".local/paypal-webhook-registration.json", root);
const envText = await readFile(envPath, "utf8");
const env = parse(envText);
if (env.PAYPAL_ENVIRONMENT !== "sandbox" || env.PAYPAL_ENABLED !== "true")
  throw new Error("This helper is sandbox-only.");
const url = new URL(process.argv[2] || "");
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.port ||
  url.pathname !== "/api/webhooks/paypal" ||
  url.search ||
  url.hash
)
  throw new Error("Expected an HTTPS PayPal webhook URL.");
const appFingerprint = createHash("sha256")
  .update(env.PAYPAL_CLIENT_ID.trim())
  .digest("hex");
async function call(path, method = "GET", body = undefined) {
  const tokenResponse = await fetch(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID.trim()}:${env.PAYPAL_CLIENT_SECRET.trim()}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(30000),
    },
  );
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token)
    throw new Error("PayPal sandbox authentication failed.");
  const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(`PayPal webhook API failed (HTTP ${response.status}).`);
  return data;
}
const names = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.REFUND.PENDING",
  "PAYMENT.REFUND.FAILED",
];
let record;
try {
  record = JSON.parse(await readFile(recordPath, "utf8"));
} catch {}
const current = await call("/v1/notifications/webhooks");
let webhook = current.webhooks?.find((w) => w.url === url.href);
if (
  !webhook &&
  record?.environment === "sandbox" &&
  record.appFingerprint === appFingerprint
) {
  const own = current.webhooks?.find(
    (w) => w.id === record.id && w.url === record.url,
  );
  if (own) {
    await call(
      `/v1/notifications/webhooks/${encodeURIComponent(own.id)}`,
      "PATCH",
      [
        { op: "replace", path: "/url", value: url.href },
        {
          op: "replace",
          path: "/event_types",
          value: names.map((name) => ({ name })),
        },
      ],
    );
    webhook = await call(
      `/v1/notifications/webhooks/${encodeURIComponent(own.id)}`,
    );
  }
}
if (!webhook)
  webhook = await call("/v1/notifications/webhooks", "POST", {
    url: url.href,
    event_types: names.map((name) => ({ name })),
  });
if (!webhook?.id || webhook.url !== url.href)
  throw new Error("Unexpected webhook registration response.");
if (names.some((name) => !webhook.event_types?.some((e) => e.name === name))) {
  await call(
    `/v1/notifications/webhooks/${encodeURIComponent(webhook.id)}`,
    "PATCH",
    [
      {
        op: "replace",
        path: "/event_types",
        value: [
          ...new Set([...webhook.event_types.map((e) => e.name), ...names]),
        ].map((name) => ({ name })),
      },
    ],
  );
  webhook = await call(
    `/v1/notifications/webhooks/${encodeURIComponent(webhook.id)}`,
  );
}
for (const name of names)
  if (!webhook.event_types?.some((e) => e.name === name))
    throw new Error("Required event subscription missing.");
let nextText = envText;
for (const [key, value] of Object.entries({
  PAYPAL_WEBHOOK_ID: webhook.id,
  PAYPAL_WEBHOOK_URL: url.href,
})) {
  if (new RegExp(`^${key}=`, "m").test(nextText))
    nextText = nextText.replace(
      new RegExp(`^${key}=.*$`, "m"),
      `${key}=${value}`,
    );
  else nextText += `\n${key}=${value}\n`;
}
await writeFile(envPath, nextText);
const result = {
  id: webhook.id,
  url: url.href,
  environment: "sandbox",
  appFingerprint,
  eventTypes: names,
  updatedAt: new Date().toISOString(),
};
await writeFile(recordPath, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    id: result.id,
    url: result.url,
    environment: "sandbox",
    eventTypes: names,
  }),
);
