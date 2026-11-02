import { readFile, writeFile } from "node:fs/promises";
const base = new URL(process.env.WAFFO_LOCAL_TUNNEL_URL || "");
if (
  base.protocol !== "https:" ||
  !base.hostname.endsWith(".trycloudflare.com") ||
  base.username ||
  base.password ||
  base.port ||
  base.pathname !== "/" ||
  base.search ||
  base.hash
)
  throw new Error("Expected a local development HTTPS tunnel origin.");
const envPath = new URL("../.env.local", import.meta.url);
let contents = await readFile(envPath, "utf8");
const values = {
  WAFFO_RETURN_BASE_URL: base.origin,
  WAFFO_WEBHOOK_URL: `${base.origin}/api/webhooks/waffo`,
};
// A changed URL must be registered in the store before checkout becomes available again.
if (!contents.includes(`WAFFO_WEBHOOK_URL=${values.WAFFO_WEBHOOK_URL}`))
  contents = contents.replace(/^WAFFO_ENABLED=.*$/m, "WAFFO_ENABLED=false");
for (const [key, value] of Object.entries(values)) {
  if (new RegExp(`^${key}=`, "m").test(contents))
    contents = contents.replace(
      new RegExp(`^${key}=.*$`, "m"),
      `${key}=${value}`,
    );
  else contents += `\n${key}=${value}\n`;
}
await writeFile(envPath, contents);
await writeFile(
  new URL("../.local/waffo-webhook-registration.json", import.meta.url),
  JSON.stringify(
    {
      environment: "test",
      ...values,
      registeredWithProvider: false,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(values));
