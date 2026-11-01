/** Explicitly scoped to this dedicated local database; never enabled in production. */
export function localTestAuthEnabled() {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_TEST_AUTH_ENABLED !== "true") return false;
  try {
    const db = new URL(process.env.DATABASE_URL || "");
    return process.env.NEXT_PUBLIC_APP_URL === "http://localhost:3000" && db.hostname === "127.0.0.1" && db.port === "55432" && db.pathname === "/laconic_local" && db.username === "laconic_local";
  } catch { return false; }
}

export function localTestRequestAllowed(headers: Headers, mutation = false) {
  if (!localTestAuthEnabled() || headers.get("host") !== "localhost:3000") return false;
  const origin = headers.get("origin");
  if (origin && origin !== "http://localhost:3000") return false;
  if (mutation && origin !== "http://localhost:3000") return false;
  if (["cross-site", "same-site"].includes(headers.get("sec-fetch-site") || "")) return false;
  const forwarded = headers.get("x-forwarded-for");
  return !forwarded || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwarded);
}
