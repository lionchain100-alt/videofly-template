import { z } from "zod";

export const PRESETS = [
  {
    id: "minimal",
    name: "简洁单工具",
    en: "Minimal",
    description: "少一点干扰，多一点专注。",
    color: "#17645b",
  },
  {
    id: "studio",
    name: "创作工作台",
    en: "Workspace",
    description: "为灵感留出一个完整的空间。",
    color: "#5146e5",
  },
  {
    id: "portal",
    name: "多工具门户",
    en: "Tool directory",
    description: "让每个好工具，都容易被找到。",
    color: "#2458b5",
  },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];
export type DemoState = "empty" | "loading" | "success" | "error" | "credits" | "signed-out";
export const SECTIONS = ["examples", "features", "faq"] as const;
const bilingual = z
  .object({ zh: z.string().trim().min(1).max(160), en: z.string().trim().min(1).max(200) })
  .strict();
export const uiConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    presetVersion: z.literal("1.0.0"),
    presetId: z.enum(["minimal", "studio", "portal"]),
    brand: z
      .object({
        name: z.string().trim().min(1).max(32),
        mark: z.string().trim().min(1).max(3),
        logoPath: z
          .string()
          .max(180)
          .refine(
            (v) =>
              v === "" ||
              (/^\/(?!\/)[a-zA-Z0-9_./-]+\.(svg|png|webp|jpg)$/.test(v) && !v.includes("..")),
            "Logo 必须是 public 中的本地图片路径",
          ),
      })
      .strict(),
    theme: z
      .object({
        mode: z.enum(["light", "dark", "system"]),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        font: z.enum(["system", "serif", "mono"]),
        fontSize: z.number().int().min(14).max(18),
        radius: z.number().int().min(0).max(24),
        shadow: z.enum(["none", "soft", "medium"]),
      })
      .strict(),
    layout: z
      .object({
        density: z.enum(["comfortable", "compact"]),
        contentMaxWidth: z.number().int().min(880).max(1440),
        sidebarWidth: z.number().int().min(180).max(280),
        arrangement: z.enum(["split", "stacked"]),
        columns: z.number().int().min(1).max(3),
      })
      .strict(),
    content: z.object({ title: bilingual, subtitle: bilingual, cta: bilingual }).strict(),
    defaultTool: z.enum(["text", "video"]),
    sections: z
      .array(z.enum(SECTIONS))
      .max(3)
      .refine((v) => new Set(v).size === v.length, "区块不能重复"),
  })
  .strict();
export type UIConfig = z.infer<typeof uiConfigSchema>;
export function defaultConfig(id: PresetId = "studio"): UIConfig {
  const titles = {
    minimal: { zh: "把复杂的事，变简单。", en: "Less effort. More clarity." },
    studio: { zh: "把灵感，变成作品。", en: "A little space for your next big idea." },
    portal: { zh: "好工具，让想法更进一步。", en: "Find the right tool for your next idea." },
  };
  return {
    schemaVersion: 1,
    presetVersion: "1.0.0",
    presetId: id,
    brand: { name: "Laconic", mark: "L", logoPath: "" },
    theme: {
      mode: "light",
      accent: PRESETS.find((p) => p.id === id)!.color,
      background: "#ffffff",
      font: "system",
      fontSize: 15,
      radius: 12,
      shadow: "soft",
    },
    layout: {
      density: "comfortable",
      contentMaxWidth: 1280,
      sidebarWidth: 208,
      arrangement: "split",
      columns: 2,
    },
    content: {
      title: titles[id],
      subtitle: {
        zh: "从一段文字、一个想法开始。让 AI 帮你整理思路，释放创作时间。",
        en: "Start with a few words or an idea. Make room for the work that matters.",
      },
      cta: { zh: "生成摘要", en: "Create summary" },
    },
    defaultTool: "text",
    sections: ["examples", "features", "faq"],
  };
}
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contrastText(hex: string) {
  const l = luminance(hex);
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#111111" : "#ffffff";
}
export function readableAccent(accent: string, background: string) {
  const bg = luminance(background);
  const target = contrastText(background) === "#ffffff" ? 255 : 0;
  for (let step = 0; step <= 20; step++) {
    const color = `#${[1, 3, 5].map(i => Math.round(Number.parseInt(accent.slice(i, i + 2), 16) * (1 - step / 20) + target * step / 20).toString(16).padStart(2, "0")).join("")}`;
    const value = luminance(color);
    if ((Math.max(value, bg) + .05) / (Math.min(value, bg) + .05) >= 4.5) return color;
  }
  return contrastText(background);
}
