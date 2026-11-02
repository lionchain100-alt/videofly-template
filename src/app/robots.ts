import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/auth/",
        "/api/v1/",
        "/api/ui-studio/",
        ...["", "/en", "/zh"].flatMap((l) =>
          [
            "/admin",
            "/login",
            "/register",
            "/my-creations",
            "/settings",
            "/credits",
            "/buy-credits",
            "/ui-studio",
            "/ui-preview",
          ].map((p) => l + p),
        ),
      ],
    },
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  };
}
