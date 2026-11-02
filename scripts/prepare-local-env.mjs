import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));
let raw = await readFile(envFile, "utf8");
const env = parse(raw);
if (env.DATABASE_URL) {
  const current = new URL(env.DATABASE_URL);
  if (!["127.0.0.1", "localhost"].includes(current.hostname) || !["/videofly_preview", "/laconic_local"].includes(current.pathname)) throw new Error("Refusing to replace a database outside the dedicated local test setup.");
}
const values = {
  LOCAL_POSTGRES_ADMIN_PASSWORD: env.LOCAL_POSTGRES_ADMIN_PASSWORD || randomBytes(24).toString("hex"),
  LOCAL_DATABASE_PASSWORD: env.LOCAL_DATABASE_PASSWORD || randomBytes(24).toString("hex"),
  LOCAL_ADMIN_EMAIL: env.LOCAL_ADMIN_EMAIL || "admin@laconic.local",
  LOCAL_ADMIN_PASSWORD: env.LOCAL_ADMIN_PASSWORD || `Laconic-${randomBytes(6).toString("hex")}!`,
  LOCAL_MEMBER_PASSWORD: env.LOCAL_MEMBER_PASSWORD || `Member-${randomBytes(6).toString("hex")}!`,
  LOCAL_TEST_AUTH_ENABLED: "true",
  DATABASE_SSL_MODE: "disable",
};
values.DATABASE_URL = `postgresql://laconic_local:${values.LOCAL_DATABASE_PASSWORD}@127.0.0.1:55432/laconic_local`;
for (const [key, value] of Object.entries(values)) {
  const line = `${key}='${value}'`;
  const expression = new RegExp(`^${key}=.*$`, "m");
  raw = expression.test(raw) ? raw.replace(expression, line) : `${raw.trimEnd()}\n${line}\n`;
}
await writeFile(envFile, raw, { mode: 0o600 });
console.log("Local environment prepared. Passwords retained in ignored .env.local; values not printed.");
