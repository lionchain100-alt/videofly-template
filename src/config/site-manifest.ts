import raw from "./site.json";
import { z } from "zod";
import { uiConfigSchema } from "@/ui-presets/config";

export const supportedLocales = ["en", "zh"] as const;
export type SiteLocale = (typeof supportedLocales)[number];
export const toolIds = ["text-summary", "video-generation"] as const;
export type ToolId = (typeof toolIds)[number];
const name = z.string().regex(/^[a-z][a-z0-9_-]{1,48}$/);
export const siteManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: name,
    origin: z
      .string()
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          u.pathname === "/" &&
          (u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
        );
      }, "Use an HTTPS origin or a loopback development origin"),
    languages: z
      .object({
        default: z.enum(supportedLocales),
        enabled: z
          .array(z.enum(supportedLocales))
          .min(1)
          .max(2)
          .refine((v) => new Set(v).size === v.length),
      })
      .strict()
      .refine(
        (v) => v.enabled.includes(v.default),
        "Default language must be enabled",
      ),
    tools: z
      .object({ "text-summary": z.boolean(), "video-generation": z.boolean() })
      .strict(),
    contact: z
      .object({
        supportEmail: z.email(),
        privacyEmail: z.email(),
        docsUrl: z.union([z.literal(""), z.url().startsWith("https://")]),
      })
      .strict(),
    local: z
      .object({
        port: z.number().int().min(1024).max(65535),
        databasePort: z.number().int().min(1024).max(65535),
        databaseName: name,
        databaseUser: name,
        nativeWorkspace: z
          .string()
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/)
          .refine((v) => !v.includes("..")),
      })
      .strict(),
    isolation: z
      .object({
        cookiePrefix: name,
        fileNamespace: name,
        localVideoDirectory: z
          .string()
          .regex(/^\.local\/[a-zA-Z0-9/_-]+$/)
          .refine((v) => !v.includes("..")),
      })
      .strict(),
    ui: uiConfigSchema,
  })
  .strict();
export type SiteManifest = z.infer<typeof siteManifestSchema>;
export const siteManifest = siteManifestSchema.parse(raw);
export const videoPaths = [
  "/text-to-video",
  "/image-to-video",
  "/reference-to-video",
  "/sora-2",
  "/veo-3-1",
  "/wan-2-6",
  "/seedance-1-5",
];
export function routeTool(path: string): ToolId | undefined {
  const p = path.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
  if (videoPaths.some((v) => p === v || p.startsWith(v + "/")))
    return "video-generation";
  if (p === "/text-summary" || p.startsWith("/text-summary/"))
    return "text-summary";
}
export function routeAvailable(path: string) {
  const tool = routeTool(path);
  return !tool || siteManifest.tools[tool];
}
export function localePath(locale: string, path = "/") {
  const target = siteManifest.languages.enabled.includes(locale as SiteLocale)
    ? locale
    : siteManifest.languages.default;
  const prefix = target === siteManifest.languages.default ? "" : `/${target}`;
  return (
    `${prefix}${path === "/" ? "" : `/${path.replace(/^\/+/, "")}`}` || "/"
  );
}
