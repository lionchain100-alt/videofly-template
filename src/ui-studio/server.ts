import "server-only";
import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { uiConfigSchema, type UIConfig } from "@/ui-presets/config";
import { siteManifest, siteManifestSchema } from "@/config/site-manifest";

const configPath = path.join(process.cwd(), "src/config/site.json");
const backupPath = path.join(process.cwd(), "src/config/site.previous.json");
const state = globalThis as typeof globalThis & {
  uiStudioToken?: string;
  uiStudioQueue?: Promise<unknown>;
};
export const studioCookieName = `${siteManifest.isolation.cookiePrefix}-ui-studio`;
export const studioEnabled = () =>
  process.env.NODE_ENV === "development" &&
  process.env.UI_STUDIO_ENABLED === "true";
function localHost(host: string) {
  return ["localhost", "127.0.0.1", "[::1]"].some(
    (h) => host === `${h}:${siteManifest.local.port}`,
  );
}
export function checkLocalHeaders(h: Headers, mutation = false) {
  if (!studioEnabled() || !localHost(h.get("host") ?? "")) return false;
  const origin = h.get("origin");
  if (origin && origin !== `http://${h.get("host")}`) return false;
  if (
    h.get("sec-fetch-site") === "cross-site" ||
    h.get("sec-fetch-site") === "same-site"
  )
    return false;
  if (
    h.has("x-forwarded-for") &&
    !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(h.get("x-forwarded-for")!)
  )
    return false;
  if (
    mutation &&
    (!origin ||
      h.get("x-ui-studio-token") !== getStudioToken() ||
      !h
        .get("cookie")
        ?.split(";")
        .some((v) => v.trim() === `${studioCookieName}=${getStudioToken()}`))
  )
    return false;
  return true;
}
export async function canOpenStudio() {
  return checkLocalHeaders(await headers());
}
export function getStudioToken() {
  if (!state.uiStudioToken)
    state.uiStudioToken = randomBytes(32).toString("hex");
  return state.uiStudioToken;
}
export async function readUIConfig(): Promise<{
  config: UIConfig;
  revision: string;
}> {
  const raw = await readFile(configPath, "utf8");
  return {
    config: siteManifestSchema.parse(JSON.parse(raw)).ui,
    revision: createHash("sha256").update(raw).digest("hex"),
  };
}
export async function updateUIConfig(
  config: UIConfig | null,
  expectedRevision: string,
) {
  const work = async () => {
    const before = await readUIConfig();
    if (before.revision !== expectedRevision) throw new Error("CONFLICT");
    const next =
      config ??
      siteManifestSchema.parse(JSON.parse(await readFile(backupPath, "utf8")))
        .ui;
    const valid = uiConfigSchema.parse(next);
    await mkdir(path.dirname(configPath), { recursive: true });
    // Keep the exact previous file so rollback preserves its content and revision semantics.
    const oldRaw = await readFile(configPath, "utf8");
    await writeFile(backupPath, oldRaw, { mode: 0o600 });
    const temporary = `${configPath}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      const manifest = siteManifestSchema.parse(JSON.parse(oldRaw));
      manifest.ui = valid;
      await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(temporary, configPath);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return readUIConfig();
  };
  const result = (state.uiStudioQueue ?? Promise.resolve())
    .catch(() => {})
    .then(work);
  state.uiStudioQueue = result;
  return result;
}
