import { readSiteManifest } from "@/config/site-server";
export const dynamic = "force-dynamic";
function xml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export async function GET() {
  const site = await readSiteManifest();
  if (site.ui.brand.logoPath)
    return Response.redirect(new URL(site.ui.brand.logoPath, site.origin));
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${site.ui.theme.accent}"/><text x="32" y="44" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="34" fill="white">${xml(site.ui.brand.mark)}</text></svg>`,
    {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" },
    },
  );
}
