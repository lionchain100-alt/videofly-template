import { notFound } from "next/navigation";
import { canOpenStudio, readUIConfig } from "@/ui-studio/server";
import { StudioPreview } from "@/ui-studio/preview";
export const dynamic = "force-dynamic";
export const metadata = { title: "UI Preview · Laconic", robots: { index: false, follow: false } };
export default async function PreviewPage() {
  if (!await canOpenStudio()) notFound();
  return <StudioPreview initialConfig={(await readUIConfig()).config}/>;
}
