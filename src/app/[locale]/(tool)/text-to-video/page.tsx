import {
  toolMetadata,
  VerifiedToolPage,
} from "@/components/verified-tool-page";
import type { Locale } from "@/config/i18n-config";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: { params: Promise<{ locale: Locale }> }) {
  return toolMetadata((await params).locale, "video");
}
export default async function Page({
  params,
}: { params: Promise<{ locale: Locale }> }) {
  return <VerifiedToolPage locale={(await params).locale} tool="video" />;
}
