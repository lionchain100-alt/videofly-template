// @ts-check
import { readFileSync } from "node:fs";
import createNextIntlPlugin from "next-intl/plugin";

const site = JSON.parse(
  readFileSync(new URL("./src/config/site.json", import.meta.url), "utf8"),
);
if (
  process.env.NEXT_PUBLIC_APP_URL &&
  process.env.NEXT_PUBLIC_APP_URL !== site.origin
)
  throw new Error("NEXT_PUBLIC_APP_URL must match site.json origin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

if (!process.env.SKIP_ENV_VALIDATION) {
  await import("./src/env.mjs");
  await import("./src/lib/auth/env.mjs");
}

/** @type {import("next").NextConfig} */
const config = {
  devIndicators: false,
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "www.twillot.com" },
      { protocol: "https", hostname: "cdnv2.ruguoapp.com" },
      { protocol: "https", hostname: "www.setupyourpay.com" },
    ],
  },
  // Dependency compatibility must pass type checking before a build can ship.
  typescript: { ignoreBuildErrors: false },
  // Ordinary Node output avoids Windows symlink privileges for local production QA.
  // The deployment default remains standalone.
  output: process.env.NEXT_LOCAL_BUILD === "true" ? undefined : "standalone",
};

// Compose plugins
export default withNextIntl(config);
