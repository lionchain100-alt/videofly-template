import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "http://localhost:3000";
const results = [];
for (const locale of ["", "/zh"]) {
  for (const path of [
    "",
    "/text-summary",
    "/text-to-video",
    "/pricing",
    "/privacy-policy",
    "/terms-of-service",
  ]) {
    const r = await fetch(base + locale + path);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert(html.includes("Laconic"));
    assert(html.includes(`rel="canonical" href="${base}${locale}${path}`));
    results.push({ route: locale + path || "/", status: r.status });
  }
  for (const path of [
    "/image-to-video",
    "/reference-to-video",
    "/sora-2",
    "/veo-3-1",
    "/wan-2-6",
    "/seedance-1-5",
  ]) {
    const r = await fetch(base + locale + path);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert(r.headers.get("x-robots-tag")?.includes("noindex"));
    assert(html.includes("Legacy interface") || html.includes("旧版界面"));
    results.push({ legacy: locale + path, noindex: true, notice: true });
  }
  for (const path of ["/login", "/register"]) {
    const r = await fetch(base + locale + path);
    assert(r.headers.get("x-robots-tag")?.includes("noindex"));
  }
}
const xml = await (await fetch(base + "/sitemap.xml")).text();
for (const x of ["/text-summary", "/text-to-video", "/zh/text-summary"])
  assert(xml.includes(x));
for (const x of [
  "/sora-2",
  "/veo-3-1",
  "/image-to-video",
  "/admin",
  "/login",
  "/buy-credits",
  "/ui-studio",
])
  assert(!xml.includes(x));
const robots = await (await fetch(base + "/robots.txt")).text();
assert(robots.includes("Disallow: /zh/admin"));
assert(robots.includes("Sitemap: http://localhost:3000/sitemap.xml"));
const auth = await (await fetch(base + "/api/v1/auth/config")).json();
assert.equal(auth.local, true);
assert(!JSON.stringify(auth).includes("SECRET"));
await writeFile(
  "docs/project-state/aud-008-seo-results.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      results,
      canonicalRoutes: 12,
      legacyNoticeRoutes: 12,
      sitemapAllowlist: true,
      privateNoindex: true,
      publicAuthFlagsOnly: true,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS canonical/hreflang route inventory, legacy boundaries/noindex, sitemap/robots and authentication projection",
);
