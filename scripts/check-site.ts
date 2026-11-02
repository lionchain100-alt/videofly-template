import { siteManifest as site } from "../src/config/site-manifest";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
if (process.env.NEXT_PUBLIC_APP_URL !== site.origin)
  throw new Error("NEXT_PUBLIC_APP_URL must match site.json origin");
console.log(
  `SITE_CONFIG_OK ${site.id}: ${site.languages.enabled.join(",")} / ${site.origin}`,
);
