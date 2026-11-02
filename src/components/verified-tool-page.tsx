import { SiteRenderer } from "@/ui-presets/site-renderer";
import { readUIConfig, studioEnabled } from "@/ui-studio/server";
import { buildAlternates } from "@/lib/seo";
import type { Locale } from "@/config/i18n-config";
export async function toolMetadata(locale: Locale, tool: "text" | "video") {
  const { config } = await readUIConfig();
  const name =
      tool === "text"
        ? locale === "zh"
          ? "文本摘要"
          : "Text summary"
        : locale === "zh"
          ? "文生视频"
          : "Text to video";
  const description =
      tool === "text"
        ? locale === "zh"
          ? "将原文整理为摘要，保存任务与结果。"
          : "Summarize source text with saved tasks and results."
        : locale === "zh"
          ? "Kie Wan 2.7 文生视频，5 秒、1080p，结果私有保存。"
          : "Kie Wan 2.7 text-to-video, 5 seconds at 1080p with private results.";
  return {
    title: { absolute: `${config.brand.name} · ${name}` },
    description,
    alternates: buildAlternates(
      tool === "text" ? "/text-summary" : "/text-to-video",
      locale,
    ),
    openGraph: {
      title: `${config.brand.name} · ${name}`,
      description,
      url: buildAlternates(
        tool === "text" ? "/text-summary" : "/text-to-video",
        locale,
      ).canonical,
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: { title: `${config.brand.name} · ${name}`, description },
  };
}
export async function VerifiedToolPage({
  locale,
  tool,
}: { locale: Locale; tool: "text" | "video" }) {
  const { config } = await readUIConfig();
  return (
    <SiteRenderer
      config={{ ...config, defaultTool: tool }}
      locale={locale}
      studioLink={studioEnabled()}
      initialOpen
    />
  );
}
