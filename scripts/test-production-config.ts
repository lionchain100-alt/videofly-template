import assert from "node:assert/strict";
import { checkProductionConfiguration } from "../src/config/production-check";

const site = { id: "fixture", origin: "https://app.owner-domain.dev", contact: { supportEmail: "support@owner-domain.dev", privacyEmail: "privacy@owner-domain.dev" }, tools: { "text-summary": true, "video-generation": true }, isolation: { cookiePrefix: "fixture-auth", fileNamespace: "fixture" } };
const valid = {
  NODE_ENV: "production", NEXT_PUBLIC_APP_URL: site.origin,
  LOCAL_TEST_AUTH_ENABLED: "false", UI_STUDIO_ENABLED: "false",
  BETTER_AUTH_SECRET: "a".repeat(64), BACKUP_ENCRYPTION_KEY: "b".repeat(64),
  DATABASE_URL: "postgresql://app:fixture@database.owner-domain.dev/site", DATABASE_SSL_MODE: "require",
  ASSET_STORAGE_BACKEND: "s3", ASSET_S3_ENDPOINT: "https://account.r2.cloudflarestorage.com", ASSET_S3_BUCKET: "private-site", ASSET_S3_REGION: "auto", ASSET_S3_ACCESS_KEY_ID: "fixture-access", ASSET_S3_SECRET_ACCESS_KEY: "fixture-secret",
  AUTH_GOOGLE_ENABLED: "false", AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_fixture", RESEND_FROM: "auth@owner-domain.dev",
  TEXT_AI_ENABLED: "true", TEXT_AI_API_KEY: "fixture-key", TEXT_AI_MODEL: "deepseek-flash", TEXT_AI_BASE_URL: "https://api.deepseek.com",
  VIDEO_AI_ENABLED: "true", VIDEO_AI_MODEL: "wan/2-7-text-to-video", KIE_API_KEY: "fixture-key",
};
assert(checkProductionConfiguration(site, valid).passed);
const failures = {
  NEXT_PUBLIC_APP_URL: "https://another.owner-domain.dev", NODE_ENV: "development",
  LOCAL_TEST_AUTH_ENABLED: "true", UI_STUDIO_ENABLED: "true", SKIP_ENV_VALIDATION: "true",
  BETTER_AUTH_SECRET: "short", BACKUP_ENCRYPTION_KEY: "invalid", DATABASE_URL: "not-a-db",
  DATABASE_SSL_MODE: "disable", ASSET_STORAGE_BACKEND: "local", ASSET_S3_SECRET_ACCESS_KEY: "",
  AUTH_EMAIL_ENABLED: "false", TEXT_AI_ENABLED: "false", TEXT_AI_API_KEY: "", KIE_API_KEY: "",
  PAYMENT_RETURN_BASE_URL: "https://another.owner-domain.dev", PAYPAL_ENABLED: "true",
  STRIPE_ENABLED: "true", CREEM_ENABLED: "true", WAFFO_ENABLED: "true",
};
for (const [key, value] of Object.entries(failures)) assert(!checkProductionConfiguration(site, { ...valid, [key]: value }).passed, key);
for (const origin of ["http://app.owner-domain.dev", "https://localhost", "https://127.0.0.1", "https://example.com", "https://private.local", "https://user:password@app.owner-domain.dev", "https://app.owner-domain.dev/path"])
  assert(!checkProductionConfiguration({ ...site, origin }, { ...valid, NEXT_PUBLIC_APP_URL: origin }).passed, origin);
const disabled = { ...site, tools: { "text-summary": false, "video-generation": false } };
assert(checkProductionConfiguration(disabled, { ...valid, TEXT_AI_API_KEY: "", KIE_API_KEY: "" }).passed);
const encoded = JSON.stringify(checkProductionConfiguration(site, valid));
for (const key of [valid.BETTER_AUTH_SECRET, valid.DATABASE_URL, valid.ASSET_S3_SECRET_ACCESS_KEY, valid.RESEND_API_KEY]) assert(!encoded.includes(key));
console.log(`PASS production configuration: valid candidate, ${Object.keys(failures).length} missing/unsafe variants, 7 origin guards, disabled tools and secret-free reporting; no external calls`);
