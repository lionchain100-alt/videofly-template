export function productionAuthConfig(
  e: Record<string, string | undefined> = process.env,
) {
  const valid = (v: string | undefined) =>
    !!v && !/^(your[-_]|local[-_]|placeholder|re_local|test[-_])/i.test(v);
  let secure = false;
  try {
    secure = new URL(e.NEXT_PUBLIC_APP_URL || "").protocol === "https:";
  } catch {}
  const google =
    secure &&
    e.AUTH_GOOGLE_ENABLED !== "false" &&
    valid(e.GOOGLE_CLIENT_ID) &&
    valid(e.GOOGLE_CLIENT_SECRET);
  const email =
    secure &&
    e.AUTH_EMAIL_ENABLED !== "false" &&
    valid(e.RESEND_API_KEY) &&
    /^re_/.test(e.RESEND_API_KEY || "") &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(e.RESEND_FROM || "");
  return { google, email, ready: google || email, secureOrigin: secure };
}
export function safeLoginReturn(value: string | null, fallback: string) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\x00-\x20]/.test(value) &&
    !/%(?:2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(value)
    ? value
    : fallback;
}
