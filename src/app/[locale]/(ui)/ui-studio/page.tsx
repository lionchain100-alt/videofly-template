import { notFound } from "next/navigation";
import { canOpenStudio, readUIConfig } from "@/ui-studio/server";
import { Studio } from "@/ui-studio/studio";
export const dynamic = "force-dynamic";
export const metadata = { title: "UI Studio · Laconic", robots: { index: false, follow: false } };
export default async function StudioPage() {
  if (!await canOpenStudio()) notFound();
  return <Studio initialConfig={(await readUIConfig()).config}/>;
}
