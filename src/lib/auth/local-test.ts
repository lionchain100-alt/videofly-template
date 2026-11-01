import { siteManifest as site } from "@/config/site-manifest";
/** Explicitly scoped to this site's dedicated local database; never enabled in production. */
export function localTestAuthEnabled() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_TEST_AUTH_ENABLED !== "true"
  )
    return false;
  try {
    const db = new URL(process.env.DATABASE_URL || "");
    return (
      process.env.NEXT_PUBLIC_APP_URL === site.origin &&
      site.origin === `http://localhost:${site.local.port}` &&
      db.hostname === "127.0.0.1" &&
      db.port === String(site.local.databasePort) &&
      db.pathname === `/${site.local.databaseName}` &&
      db.username === site.local.databaseUser
    );
  } catch {
    return false;
  }
}

export function localTestRequestAllowed(headers: Headers, mutation = false) {
  if (
    !localTestAuthEnabled() ||
    headers.get("host") !== `localhost:${site.local.port}`
  )
    return false;
  const origin = headers.get("origin");
  if (origin && origin !== site.origin) return false;
  if (mutation && origin !== site.origin) return false;
  if (["cross-site", "same-site"].includes(headers.get("sec-fetch-site") || ""))
    return false;
  const forwarded = headers.get("x-forwarded-for");
  return (
    !forwarded || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwarded)
  );
}
