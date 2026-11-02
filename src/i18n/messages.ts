import { siteManifest as site } from "@/config/site-manifest";
function brand<T>(value: T): T {
  if (typeof value === "string")
    return value
      .replaceAll("__SITE_NAME__", site.ui.brand.name)
      .replaceAll("__SUPPORT_EMAIL__", site.contact.supportEmail)
      .replaceAll("__PRIVACY_EMAIL__", site.contact.privacyEmail) as T;
  if (Array.isArray(value)) return value.map(brand) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, brand(v)]),
    ) as T;
  return value;
}
/**
 * Load translation messages for a given locale
 */
async function getMessagesForLocale(locale: string) {
  try {
    const messages = (await import(`@/messages/${locale}.json`)).default;
    return brand(messages);
  } catch (error) {
    // Fallback to default locale (en) if translation not found
    console.warn(
      `Translation for locale "${locale}" not found, falling back to "en"`,
    );
    const defaultMessages = (
      await import(`@/messages/${site.languages.default}.json`)
    ).default;
    return brand(defaultMessages);
  }
}

/**
 * Export for use in request.ts
 */
export { getMessagesForLocale };
