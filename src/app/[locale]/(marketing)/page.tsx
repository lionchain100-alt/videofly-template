import { readUIConfig, studioEnabled } from "@/ui-studio/server";
import { SiteRenderer } from "@/ui-presets/site-renderer";
import { buildAlternates } from "@/lib/seo";
import type { Locale } from "@/config/i18n-config";

export const dynamic = "force-dynamic";
interface HomePageProps { params: Promise<{ locale: Locale }> }
export async function generateMetadata({ params }: HomePageProps) {
  const { locale } = await params;
  const { config } = await readUIConfig();
  const language = locale === "zh" ? "zh" : "en";
  const title = `${config.brand.name} · ${config.content.title[language]}`;
  const description = config.content.subtitle[language];
  const alternates = buildAlternates("/", locale);
  return { title: { absolute: title }, description, alternates, openGraph: { title, description, url: alternates.canonical }, twitter: { title, description } };
}
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  return <SiteRenderer config={(await readUIConfig()).config} locale={locale === "zh" ? "zh" : "en"} studioLink={studioEnabled()}/>;
}
