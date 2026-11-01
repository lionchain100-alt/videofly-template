import { localePath } from "@/config/site-manifest";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveSessionUser } from "./active-user";
import type { Locale } from "@/config/i18n-config";

export async function requireAdmin(redirectTo = "/login") {
  const user = await getActiveSessionUser(await headers());
  if (!user || !user.isAdmin || !user.emailVerified) redirect(redirectTo);
  return user;
}
export async function isAdmin() {
  const user = await getActiveSessionUser(await headers());
  return !!user?.isAdmin && !!user.emailVerified;
}
export function getLoginRedirect(locale: Locale = "en"): string {
  return localePath(locale, `/login`);
}
