import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
export const root = fileURLToPath(new URL("../", import.meta.url));
export const site = JSON.parse(
  readFileSync(new URL("../src/config/site.json", import.meta.url), "utf8"),
);
config({ path: new URL("../.env.local", import.meta.url), quiet: true });
for (const value of [
  site.id,
  site.local.databaseName,
  site.local.databaseUser,
  site.isolation.cookiePrefix,
  site.isolation.fileNamespace,
]) {
  if (!/^[a-z][a-z0-9_-]{1,48}$/.test(value))
    throw new Error("Invalid site identity");
}
if (
  !/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(site.local.nativeWorkspace) ||
  site.local.nativeWorkspace.includes("..")
)
  throw new Error("Invalid native path");
export function localDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== String(site.local.databasePort) ||
    url.pathname !== `/${site.local.databaseName}` ||
    url.username !== site.local.databaseUser ||
    url.search ||
    url.hash
  )
    throw new Error("Database URL does not match this site manifest");
  if (
    site.origin !== `http://localhost:${site.local.port}` ||
    process.env.NEXT_PUBLIC_APP_URL !== site.origin
  )
    throw new Error("Local origin does not match this site manifest");
  return url;
}
