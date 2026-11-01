import { siteManifest } from "./site-manifest";
export const i18n = {
  defaultLocale: siteManifest.languages.default,
  locales: siteManifest.languages.enabled,
};

export type Locale = (typeof i18n)["locales"][number];

// 语言配置对象（用于 next-intl）
export const localeConfig = {
  en: {
    flag: "🇺🇸",
    name: "English",
    hreflang: "en",
  },
  zh: {
    flag: "🇨🇳",
    name: "中文",
    hreflang: "zh-CN",
  },
} as const;

// Cookie 名称
export const LOCALE_COOKIE_NAME = `${siteManifest.isolation.cookiePrefix}-locale`;

// 向后兼容的 localeMap
export const localeMap = {
  en: "English",
  zh: "中文",
} as const;
