import "server-only";
import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { defaultConfig, uiConfigSchema, type UIConfig } from "@/ui-presets/config";

const configPath = path.join(process.cwd(), "src/config/site-ui.json");
const backupPath = path.join(process.cwd(), "src/config/site-ui.previous.json");
const state = globalThis as typeof globalThis & {
  uiStudioToken?: string;
  uiStudioQueue?: Promise<unknown>;
};
export const studioEnabled = () =>
  process.env.NODE_ENV === "development" && process.env.UI_STUDIO_ENABLED === "true";
function localHost(host: string) {
  return /^(localhost|127\.0\.0\.1|\[::1\]):3000$/.test(host);
}
export function checkLocalHeaders(h: Headers, mutation = false) {
  if (!studioEnabled() || !localHost(h.get("host") ?? "")) return false;
  const origin = h.get("origin");
  if (origin && origin !== `http://${h.get("host")}`) return false;
  if (h.get("sec-fetch-site") === "cross-site" || h.get("sec-fetch-site") === "same-site")
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
        .some((v) => v.trim() === `ui-studio-session=${getStudioToken()}`))
  )
    return false;
  return true;
}
export async function canOpenStudio() {
  return checkLocalHeaders(await headers());
}
export function getStudioToken() {
  if (!state.uiStudioToken) state.uiStudioToken = randomBytes(32).toString("hex");
  return state.uiStudioToken;
}
export async function readUIConfig(): Promise<{ config: UIConfig; revision: string }> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    raw = JSON.stringify(defaultConfig());
  }
  return {
    config: uiConfigSchema.parse(JSON.parse(raw)),
    revision: createHash("sha256").update(raw).digest("hex"),
  };
}
export async function updateUIConfig(config: UIConfig | null, expectedRevision: string) {
  const work = async () => {
    const before = await readUIConfig();
    if (before.revision !== expectedRevision) throw new Error("CONFLICT");
    const next = config ?? uiConfigSchema.parse(JSON.parse(await readFile(backupPath, "utf8")));
    const valid = uiConfigSchema.parse(next);
    await mkdir(path.dirname(configPath), { recursive: true });
    // Keep the exact previous file so rollback preserves its content and revision semantics.
    const oldRaw = await readFile(configPath, "utf8").catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return JSON.stringify(before.config, null, 2);
      throw e;
    });
    await writeFile(backupPath, oldRaw, { mode: 0o600 });
    const temporary = `${configPath}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, configPath);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return readUIConfig();
  };
  const result = (state.uiStudioQueue ?? Promise.resolve()).catch(() => {}).then(work);
  state.uiStudioQueue = result;
  return result;
}
