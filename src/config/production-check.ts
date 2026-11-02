import { productionAuthConfig } from "../lib/auth/production-config";

type Environment = Record<string, string | undefined>;
type DeploymentSite = {
  id: string;
  origin: string;
  contact: { supportEmail: string; privacyEmail: string };
  tools: Record<string, boolean>;
  isolation: { cookiePrefix: string; fileNamespace: string };
};

// Read-only syntax/consistency checks. No network, database or provider actions.
export function checkProductionConfiguration(site: DeploymentSite, e: Environment) {
  const checks: { id: string; passed: boolean; action: string }[] = [];
  const check = (id: string, passed: unknown, action: string) =>
    checks.push({ id, passed: !!passed, action });
  const present = (key: string) => !!e[key]?.trim() &&
    !/^(your[-_]|local[-_]|placeholder|re_local|test[-_])/i.test(e[key] || "");
  const publicHttps = (value: string | undefined, allowPath = false) => {
    try {
      const u = new URL(value || "");
      return u.protocol === "https:" && !u.username && !u.password &&
        !u.search && !u.hash && (allowPath || u.pathname === "/") &&
        !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.(local|test|example|invalid)$)/i.test(u.hostname) &&
        !/^(example\.(com|org|net))$/i.test(u.hostname);
    } catch { return false; }
  };
  check("origin.https", publicHttps(site.origin), "Use an owned fixed public HTTPS origin in site.json");
  check("origin.match", e.NEXT_PUBLIC_APP_URL === site.origin, "NEXT_PUBLIC_APP_URL must equal site.origin");
  check("runtime.production", e.NODE_ENV === "production", "Run with NODE_ENV=production");
  check("runtime.env-validation", !e.SKIP_ENV_VALIDATION, "Remove SKIP_ENV_VALIDATION");
  check("runtime.local-auth-off", e.LOCAL_TEST_AUTH_ENABLED === "false", "Set LOCAL_TEST_AUTH_ENABLED=false explicitly");
  check("runtime.studio-off", e.UI_STUDIO_ENABLED === "false", "Set UI_STUDIO_ENABLED=false explicitly");
  check("auth.secret", present("BETTER_AUTH_SECRET") && (e.BETTER_AUTH_SECRET?.length || 0) >= 32, "Generate an independent auth secret of at least 32 characters");
  const auth = productionAuthConfig(e);
  check("auth.method", auth.ready, "Configure Google OAuth or verified-sender email sign-in");
  check("auth.google", e.AUTH_GOOGLE_ENABLED !== "true" || auth.google, "Enabled Google sign-in needs client ID and secret");
  check("auth.email", e.AUTH_EMAIL_ENABLED !== "true" || auth.email, "Enabled email sign-in needs Resend key and bare sender email");
  let databaseValid = false;
  try {
    const u = new URL(e.DATABASE_URL || "");
    databaseValid = ["postgres:", "postgresql:"].includes(u.protocol) && !!u.username &&
      !!u.password && u.pathname.length > 1;
  } catch {}
  check("database.url", databaseValid, "Configure a dedicated PostgreSQL database/user/password");
  check("database.tls", ["require", "true", "1", "on"].includes(e.DATABASE_SSL_MODE || ""), "Set DATABASE_SSL_MODE=require; verify managed database TLS separately");
  check("storage.private", e.ASSET_STORAGE_BACKEND === "s3", "Configure private S3/R2 storage, public access disabled");
  check("storage.endpoint", publicHttps(e.ASSET_S3_ENDPOINT), "Configure HTTPS private S3/R2 endpoint without credentials/path");
  check("storage.credentials", ["ASSET_S3_BUCKET", "ASSET_S3_REGION", "ASSET_S3_ACCESS_KEY_ID", "ASSET_S3_SECRET_ACCESS_KEY"].every(present), "Configure bucket, region and bucket-scoped read/write keys");
  check("backup.key", /^[a-f\d]{64}$/i.test(e.BACKUP_ENCRYPTION_KEY || "") && e.BACKUP_ENCRYPTION_KEY !== e.BETTER_AUTH_SECRET, "Generate a separate 32-byte hex backup key and retain it outside backups");
  check("site.namespace", !!site.id && !!site.isolation.cookiePrefix && !!site.isolation.fileNamespace, "Keep unique site ID, cookie prefix and file namespace");
  check("site.contact", [site.contact.supportEmail, site.contact.privacyEmail].every(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && !/\.(local|test|example|invalid)$/i.test(v)), "Replace local support/privacy email addresses");
  if (site.tools["text-summary"]) {
    check("ai.text", e.TEXT_AI_ENABLED === "true" && ["TEXT_AI_API_KEY", "TEXT_AI_MODEL", "TEXT_AI_BASE_URL"].every(present), "Enabled summary tool requires configured text executor");
    check("ai.text-https", publicHttps(e.TEXT_AI_BASE_URL, true), "Use a public HTTPS text API base URL");
  }
  if (site.tools["video-generation"])
    check("ai.video", e.VIDEO_AI_ENABLED === "true" && present("KIE_API_KEY") && !!e.VIDEO_AI_MODEL, "Enabled video tool requires configured Kie executor/model");
  const required: Record<string, string[]> = {
    PAYPAL: ["CLIENT_ID", "CLIENT_SECRET", "MERCHANT_ID", "WEBHOOK_ID"],
    WAFFO: ["MERCHANT_ID", "STORE_ID", "PRIVATE_KEY", "WEBHOOK_PUBLIC_KEY", "PRODUCT_STARTER", "PRODUCT_STANDARD"],
    STRIPE: ["API_KEY", "ACCOUNT_ID", "WEBHOOK_SECRET", "PRICE_STARTER", "PRICE_STANDARD"],
    CREEM: ["API_KEY", "ACCOUNT_SCOPE", "WEBHOOK_SECRET", "PRODUCT_STARTER", "PRODUCT_STANDARD"],
  };
  const productionModes: Record<string, string> = { PAYPAL: "live", WAFFO: "prod", STRIPE: "live", CREEM: "live" };
  for (const [provider, keys] of Object.entries(required)) {
    if (e[`${provider}_ENABLED`] !== "true") continue;
    check(`payment.${provider.toLowerCase()}.keys`, keys.every(k => present(`${provider}_${k}`)), `Configure all enabled ${provider} credentials, verification and product mappings`);
    check(`payment.${provider.toLowerCase()}.mode`, e[`${provider}_ENVIRONMENT`] === productionModes[provider], `Use ${provider} production mode only after separate platform acceptance`);
    if (provider === "STRIPE") check("payment.stripe.key-mode", e.STRIPE_API_KEY?.startsWith("sk_live_"), "Stripe live mode requires live key");
    if (provider === "CREEM") check("payment.creem.key-mode", !e.CREEM_API_KEY?.startsWith("creem_test_"), "Creem live mode must not use test key");
  }
  for (const key of ["PAYMENT_RETURN_BASE_URL", "WAFFO_RETURN_BASE_URL", "PAYPAL_WEBHOOK_URL", "WAFFO_WEBHOOK_URL"]) {
    if (e[key]) {
      let sameOrigin = false;
      try { sameOrigin = new URL(e[key] || "").origin === new URL(site.origin).origin; } catch {}
      check(`callback.${key}`, sameOrigin, `${key} must belong to this site's fixed HTTPS origin`);
    }
  }
  return {
    scope: "Static production configuration only; no deployment or provider acceptance",
    passed: checks.every(c => c.passed), checks,
    deferred: ["Owned HTTPS/DNS and real OAuth/email callbacks", "Private bucket policy and live object probe", "Database migrations, verified Owner and Worker readiness", "Per-channel products, real signed callbacks, payments/refunds and reconciliation", "Offsite backup restoration, rollback and operations acceptance"],
  };
}
