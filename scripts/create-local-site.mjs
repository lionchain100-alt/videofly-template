import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  lstat,
  readdir,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instanceStateDocuments } from "./instance-state.mjs";
const source = fileURLToPath(new URL("../", import.meta.url));
const [id = "aurora-notes", portString = "3002", dbPortString = "55433"] =
  process.argv.slice(2).filter((v) => v !== "--");
if (!/^[a-z][a-z0-9-]{2,30}$/.test(id))
  throw new Error("Use a lowercase site ID, 3–31 characters");
const port = Number(portString),
  databasePort = Number(dbPortString);
if (
  ![port, databasePort].every(
    (v) => Number.isInteger(v) && v >= 1024 && v <= 65535,
  ) ||
  port === databasePort
)
  throw new Error("Invalid or colliding ports");
const original = JSON.parse(
  await readFile(path.join(source, "src/config/site.json"), "utf8"),
);
if (
  [port, databasePort].some((p) =>
    [original.local.port, original.local.databasePort].includes(p),
  ) ||
  id === original.id
)
  throw new Error("New site must have a different ID and ports");
const workspace = path.resolve(source, ".."),
  destination = path.join(workspace, "sites", id);
for (const entry of await readdir(path.join(workspace, "sites"), {
  withFileTypes: true,
}).catch((e) => {
  if (e.code === "ENOENT") return [];
  throw e;
})) {
  if (!entry.isDirectory()) continue;
  let other;
  try {
    other = JSON.parse(await readFile(
      path.join(workspace, "sites", entry.name, "src/config/site.json"),
      "utf8",
    ));
  } catch (e) {
    if (e.code === "ENOENT") continue; // Ordinary non-site directories.
    throw e;
  }
  if (
    [port, databasePort].some((p) =>
      [other.local.port, other.local.databasePort].includes(p),
    )
  )
    throw new Error(
      `Ports already belong to site ${other.id}; choose new HTTP and database ports`,
    );
}
try {
  await lstat(destination);
  throw new Error(
    "Destination already exists; existing sites are never overwritten",
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
// Copy source files only. Never read or copy the source site's environment/data/assets.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: source },
)
  .toString()
  .split("\0")
  .filter(Boolean);
const allowed = files.filter(
  (f) =>
    !f.startsWith(".git/") &&
    !f.startsWith(".local/") &&
    !f.startsWith("node_modules/") &&
    !f.startsWith(".next/") &&
    !/^\.env(?!\.example$)/.test(f) &&
    !f.endsWith(".log") &&
    !f.endsWith(".pid") &&
    !f.includes("previous.json") &&
    !f.split(/[\\/]/).some((segment) => segment === ".." || segment === ".") &&
    !path.isAbsolute(f),
);
await mkdir(destination, { recursive: true });
for (const f of allowed) {
  let entry;
  try {
    entry = await lstat(path.join(source, f));
  } catch (e) {
    if (e.code === "ENOENT") continue;
    throw e;
  }
  if (!entry.isFile())
    throw new Error("Only regular source files may be copied");
  const target = path.join(destination, f);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(source, f), target);
}
const site = structuredClone(original),
  databaseName = id.replaceAll("-", "_") + "_local";
site.id = id;
site.origin = `http://localhost:${port}`;
site.languages = { default: "zh", enabled: ["zh"] };
site.tools = { "text-summary": true, "video-generation": false };
site.contact = {
  supportEmail: `support@${id}.local`,
  privacyEmail: `privacy@${id}.local`,
  docsUrl: "",
};
site.local = {
  port,
  databasePort,
  databaseName,
  databaseUser: databaseName,
  nativeWorkspace: `LaconicReel/sites/${id}`,
};
site.isolation = {
  cookiePrefix: `${id}-auth`,
  fileNamespace: id,
  localVideoDirectory: `.local/sites/${id}/generated-videos`,
};
site.ui.brand.name = id
  .split("-")
  .map((w) => w[0].toUpperCase() + w.slice(1))
  .join(" ");
site.ui.brand.mark = site.ui.brand.name[0];
site.ui.presetId = "minimal";
site.ui.defaultTool = "text";
site.ui.content.title = {
  zh: "把长文变成清楚的重点",
  en: "Clear notes from long reads",
};
site.ui.content.subtitle = {
  zh: "独立的文字工具站。粘贴内容，整理重点。",
  en: "An independent workspace for useful summaries.",
};
await writeFile(
  path.join(destination, "src/config/site.json"),
  JSON.stringify(site, null, 2) + "\n",
);
const secret = () => randomBytes(32).toString("hex"),
  dbPassword = secret();
const env = {
  ASSET_STORAGE_BACKEND:"local",
  BACKUP_ENCRYPTION_KEY:secret(),
  NEXT_PUBLIC_APP_URL: site.origin,
  BETTER_AUTH_SECRET: secret(),
  DATABASE_URL: `postgresql://${databaseName}:${dbPassword}@127.0.0.1:${databasePort}/${databaseName}`,
  DATABASE_SSL_MODE: "disable",
  LOCAL_DATABASE_PASSWORD: dbPassword,
  LOCAL_POSTGRES_ADMIN_PASSWORD: secret(),
  LOCAL_ADMIN_EMAIL: `admin@${id}.local`,
  LOCAL_ADMIN_PASSWORD: `Local-${secret()}!`,
  LOCAL_MEMBER_EMAIL: `member@${id}.local`,
  LOCAL_MEMBER_PASSWORD: `Local-${secret()}!`,
  ADMIN_EMAIL: `admin@${id}.local`,
  LOCAL_TEST_AUTH_ENABLED: "true",
  UI_STUDIO_ENABLED: "true",
  GOOGLE_CLIENT_ID: "local-disabled",
  GOOGLE_CLIENT_SECRET: "local-disabled",
  RESEND_API_KEY: "re_local_disabled",
  RESEND_FROM: `noreply@${id}.local`,
  TEXT_AI_PROVIDER: "deepseek",
  TEXT_SUMMARY_CREDITS: "1",
  TEXT_AI_ENABLED: "false",
  TEXT_AI_API_KEY: "",
  TEXT_AI_BASE_URL: "https://api.deepseek.com",
  TEXT_AI_MODEL: "deepseek-flash",
  VIDEO_AI_ENABLED: "false",
  VIDEO_AI_PROVIDER: "kie",
  VIDEO_AI_BASE_URL: "https://api.kie.ai",
  VIDEO_AI_MODEL: "wan/2-7-text-to-video",
  VIDEO_GENERATION_CREDITS: "10",
  KIE_API_KEY: "",
  PAYPAL_ENABLED: "false",
  PAYPAL_ENVIRONMENT: "sandbox",
  PAYPAL_CLIENT_ID: "",
  PAYPAL_CLIENT_SECRET: "",
  PAYPAL_MERCHANT_ID: "",
  PAYPAL_WEBHOOK_ID: "",
  WAFFO_ENABLED: "false",
  WAFFO_ENVIRONMENT: "test",
  STRIPE_ENABLED: "false",
  STRIPE_ENVIRONMENT: "test",
  CREEM_ENABLED: "false",
  CREEM_ENVIRONMENT: "test",
};
await writeFile(
  path.join(destination, ".env.local"),
  "# Dedicated local test credentials. Do not commit or reuse in another site.\n" +
    Object.entries(env)
      .map(([k, v]) => `${k}='${v}'`)
      .join("\n") +
    "\n",
  { mode: 0o600 },
);
for (const [file, contents] of Object.entries(instanceStateDocuments(site))) {
  await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
  await writeFile(path.join(destination, file), contents);
}
execFileSync("git", ["init", "--quiet"], { cwd: destination });
console.log(
  `SITE_CREATED ${destination}\nOrigin: ${site.origin}\nCredentials: this site's .env.local (not printed).\nNext: corepack pnpm install --frozen-lockfile; powershell -File scripts/start-local-site.ps1`,
);
