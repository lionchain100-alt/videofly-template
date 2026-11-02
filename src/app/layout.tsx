import { Inter as FontSans } from "next/font/google";
import localFont from "next/font/local";
import { getLocale, getMessages } from "next-intl/server";

import "@/styles/globals.css";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";

import { cn } from "@/components/ui";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";

import { ThemeProvider } from "@/components/theme-provider";
import { PlausibleAnalytics } from "@/components/plausible-provider";
import { i18n } from "@/config/i18n-config";
import{siteManifest}from"@/config/site-manifest";
import { siteConfig } from "@/config/site";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Font files can be colocated inside of `pages`
const fontHeading = localFont({
  src: "../styles/fonts/CalSans-SemiBold.woff2",
  variable: "--font-heading",
});

export function generateStaticParams() {
  return i18n.locales.map((locale) => ({ locale }));
}

export const metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    ...(siteManifest.tools["video-generation"]?["AI video generator","text to video","video generation"]:[]),
    ...(siteManifest.tools["text-summary"]?["text summary","AI summary"]:[]),
    "AI tools",
  ],
  authors: [
    {
      name: siteConfig.name,
    },
  ],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    locale: i18n.defaultLocale === "zh" ? "zh_CN" : "en_US",
    url: siteConfig.url,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  icons: {
    icon: [{ url: "/api/site/icon", type: "image/svg+xml" }],
  },
  metadataBase: new URL(siteConfig.url),
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  name: siteConfig.name,
                  url: siteConfig.url,
                  description: siteConfig.description,
                  inLanguage: i18n.locales,
                },
                {
                  "@type": "Organization",
                  name: siteConfig.name,
                  url: siteConfig.url,
                  logo: `${siteConfig.url}/api/site/icon`,
                },
              ],
            }),
          }}
        />
      </head>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
          fontHeading.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            <QueryProvider>
              <PlausibleAnalytics />
              {children}
              <Analytics />
              <SpeedInsights />
              <Toaster richColors position="top-right" />
            </QueryProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
