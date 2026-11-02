import type { MetadataRoute } from "next";
import {
  siteManifest,
  localePath,
  routeAvailable,
} from "@/config/site-manifest";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/text-summary",
    "/text-to-video",
    "/pricing",
    "/privacy-policy",
    "/terms-of-service",
  ]
    .filter(routeAvailable)
    .flatMap((p) =>
      siteManifest.languages.enabled.map((l) => ({
        url: siteManifest.origin + localePath(l, p),
        changeFrequency: p === "/" ? ("weekly" as const) : ("monthly" as const),
        priority: p === "/" ? 1 : 0.6,
        alternates: {
          languages: Object.fromEntries(
            siteManifest.languages.enabled.map((x) => [
              x,
              siteManifest.origin + localePath(x, p),
            ]),
          ),
        },
      })),
    );
}
