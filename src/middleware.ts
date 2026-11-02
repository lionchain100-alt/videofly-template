import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextRequest, NextResponse } from "next/server";
import {
  siteManifest,
  routeAvailable,
  supportedLocales,
} from "./config/site-manifest";

const intlMiddleware = createMiddleware(routing);

/**
 * Legacy dashboard redirects
 * Maps old dashboard routes to new routes
 */
const legacyRedirects: Record<string, string> = {
  "/dashboard": "/",
  "/dashboard/videos": "/my-creations",
  "/dashboard/billing": "/credits",
  "/dashboard/settings": "/settings",
};
const orderedRedirects = Object.entries(legacyRedirects).sort(
  ([a], [b]) => b.length - a.length,
);
const legacyTarget = (to: string, rest: string) =>
  `${to === "/" ? "" : to}${rest}` || "/";

/**
 * Next-intl middleware with legacy dashboard redirects
 *
 * This middleware handles:
 * - Legacy dashboard route redirects
 * - Locale detection from cookie/headers
 * - URL locale prefix management
 * - Redirects to correct locale
 *
 * URL structure:
 * - English (default): /about, /pricing
 * - Other locales: /zh/about, /ko/pricing
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const language = pathname.split("/")[1];
  if (
    (supportedLocales.includes(language as "en" | "zh") &&
      !siteManifest.languages.enabled.includes(language as "en" | "zh")) ||
    !routeAvailable(pathname)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Check for legacy dashboard routes (without locale prefix)
  for (const [from, to] of orderedRedirects) {
    if (pathname === from || pathname.startsWith(from + "/")) {
      // Preserve the rest of the path if any
      const rest = pathname.slice(from.length);
      const url = request.nextUrl.clone();
      url.pathname = legacyTarget(to, rest);
      return NextResponse.redirect(url);
    }
  }

  // Check for legacy dashboard routes (with locale prefix)
  // e.g., /en/dashboard -> /en/image-to-video
  for (const locale of routing.locales) {
    for (const [from, to] of orderedRedirects) {
      const localeFrom = `/${locale}${from}`;
      if (pathname === localeFrom || pathname.startsWith(localeFrom + "/")) {
        const rest = pathname.slice(localeFrom.length);
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}${legacyTarget(to, rest)}`;
        return NextResponse.redirect(url);
      }
    }
  }

  request.headers.set(
    "x-ui-home",
    /^\/(?:(?:en|zh)\/?)?$|^\/(?:en\/|zh\/)?(?:text-summary|text-to-video)\/?$/.test(
      pathname,
    )
      ? "true"
      : "false",
  );
  const cleanPath = pathname.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
  const legacy = [
    "/image-to-video",
    "/reference-to-video",
    "/sora-2",
    "/veo-3-1",
    "/wan-2-6",
    "/seedance-1-5",
  ].includes(cleanPath);
  request.headers.set("x-legacy-tool", legacy ? "true" : "false");
  const response = intlMiddleware(request);
  if (
    legacy ||
    /^\/(?:en\/|zh\/)?(?:admin|login|register|my-creations|credits|settings|buy-credits|ui-studio|ui-preview)(?:\/|$)/.test(
      pathname,
    )
  )
    response.headers.set("X-Robots-Tag", "noindex, nofollow");

  // Add security headers
  const localPreview =
    process.env.NODE_ENV === "development" &&
    process.env.UI_STUDIO_ENABLED === "true" &&
    /^\/(?:en\/|zh\/)?ui-preview$/.test(pathname);
  response.headers.set("X-Frame-Options", localPreview ? "SAMEORIGIN" : "DENY");
  if (localPreview)
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  // Basic CSP to start with (adjust as needed for scripts/styles)
  // response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;")

  return response;
}

export const config = {
  // Match all pathnames except for
  // - API routes (handled separately by their route handlers)
  // - _next (Next.js internals)
  // - static files (images, fonts, etc.)
  matcher: [
    // Match all pathnames except those starting with api, _next, or having a file extension
    "/((?!api|_next|.*\\..*).*)",
    // Match root pathname
    "/",
  ],
};
