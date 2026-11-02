import { randomBytes } from "node:crypto";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import postgres from "postgres";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true")
  throw Error("CI bootstrap is restricted to an isolated GitHub Actions checkout");
if (existsSync(".env.local")) throw Error("Existing environment found; refusing CI bootstrap");
const original = await readFile("src/config/site.json", "utf8");
const site = JSON.parse(original);
await mkdir(".local", { recursive: true });
if (process.argv.includes("--build-only")) {
  await writeFile(".env.local", `NEXT_PUBLIC_APP_URL='${site.origin}'\nBETTER_AUTH_SECRET='${randomBytes(32).toString("hex")}'\nLOCAL_TEST_AUTH_ENABLED=false\nUI_STUDIO_ENABLED=false\n`, { flag: "wx", mode: 0o600 });
  console.log("CI build environment created for the unchanged site manifest");
  process.exit(0);
}
// Retained suites have explicit loopback/laconic safety guards. In this throwaway
// checkout only, normalize identity/tools to that fixture, never reuse site keys.
await writeFile(".local/ci-site-original.json", original, { flag: "wx" });
site.id = "laconic";
site.origin = "http://localhost:3000";
site.local.port = 3000;
site.local.databasePort = 55432;
site.local.databaseName = "laconic_local";
site.local.databaseUser = "laconic_local";
site.languages = { default: "en", enabled: ["en", "zh"] };
site.tools = { "text-summary": true, "video-generation": true };
site.isolation = { cookiePrefix: "better-auth", fileNamespace: "laconic", localVideoDirectory: ".local/generated-videos" };
site.ui.defaultTool = "text";
await writeFile("src/config/site.json", JSON.stringify(site, null, 2) + "\n");
if (!process.env.CI_POSTGRES_PASSWORD) throw Error("Missing isolated CI PostgreSQL password");
const admin = postgres({ host: "127.0.0.1", port: 55432, database: "postgres", username: "postgres", password: process.env.CI_POSTGRES_PASSWORD, ssl: false, max: 1 });
const secret = () => randomBytes(32).toString("hex");
const password = secret();
// Neither replace existing env files nor reuse any existing application database.
const env = {
  NEXT_PUBLIC_APP_URL: site.origin, BETTER_AUTH_SECRET: secret(),
  DATABASE_URL: `postgresql://laconic_local:${password}@127.0.0.1:55432/laconic_local`, DATABASE_SSL_MODE: "disable",
  LOCAL_TEST_AUTH_ENABLED: "true", UI_STUDIO_ENABLED: "true",
  LOCAL_ADMIN_EMAIL: "admin@laconic.local", LOCAL_ADMIN_PASSWORD: secret(),
  LOCAL_MEMBER_EMAIL: "member@laconic.local", LOCAL_MEMBER_PASSWORD: secret(),
  ASSET_STORAGE_BACKEND: "local", BACKUP_ENCRYPTION_KEY: secret(),
  TEXT_AI_PROVIDER: "deepseek", TEXT_AI_MODEL: "deepseek-flash", TEXT_AI_BASE_URL: "https://api.deepseek.com", TEXT_AI_ENABLED: "false", TEXT_SUMMARY_CREDITS: "1",
  VIDEO_AI_PROVIDER: "kie", VIDEO_AI_MODEL: "wan/2-7-text-to-video", VIDEO_AI_ENABLED: "false", VIDEO_GENERATION_CREDITS: "10",
  PAYPAL_ENABLED: "false", WAFFO_ENABLED: "false", STRIPE_ENABLED: "false", CREEM_ENABLED: "false",
  AUTH_GOOGLE_ENABLED: "false", AUTH_EMAIL_ENABLED: "false",
};
try {
  if ((await admin`select 1 from pg_database where datname='laconic_local'`).length ||
      (await admin`select 1 from pg_roles where rolname='laconic_local'`).length)
    throw Error("CI database or role already exists; refusing reuse");
  await writeFile(".env.local", Object.entries(env).map(([k, v]) => `${k}='${v}'`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  await admin.unsafe(`create role laconic_local login password '${password}' nosuperuser nocreatedb nocreaterole`);
  await admin.unsafe("create database laconic_local owner laconic_local");
  await mkdir(".local", { recursive: true });
  console.log("CI isolated database, role and ephemeral env prepared; no platform credentials");
} finally { await admin.end(); }
