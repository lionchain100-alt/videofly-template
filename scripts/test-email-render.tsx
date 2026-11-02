import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { render, toPlainText } from "@react-email/components";
import { render as runtimeRender } from "@react-email/render";
import Welcome from "../src/mail/templates/welcome-email";
import Reset from "../src/mail/templates/reset-password-email";
import Magic from "../src/mail/templates/magic-link-email";
import { WelcomeEmail } from "../src/lib/emails/welcome-email";
import { ResetPasswordEmail } from "../src/lib/emails/reset-password-email";
import { MagicLinkEmail } from "../src/lib/emails/magic-link-email";
import { siteManifest } from "../src/config/site-manifest";

async function main() {
  const require = createRequire(import.meta.url);
  const componentRequire = createRequire(require.resolve("@react-email/components"));
  assert.equal(componentRequire.resolve("@react-email/render"), require.resolve("@react-email/render"));
  const resendRequire = createRequire(require.resolve("resend"));
  assert.equal(resendRequire.resolve("@react-email/render"), require.resolve("@react-email/render"));
  const actionUrl = "https://mail-fixture.invalid/auth/verify?token=fixture&callbackURL=%2Fzh";
  const name = "Case <script>alert(1)</script> & 中文";
  const cases: { locale: string; template: string; htmlAndText: boolean }[] = [];
  for (const locale of ["en", "zh"] as const) {
    const messages = JSON.parse(await readFile(`src/messages/${locale}.json`, "utf8"));
    const shared = { locale, messages, name };
    const templates: [string, ReactElement, string][] = [
      ["welcome", createElement(Welcome, { ...shared, appUrl: "https://mail-fixture.invalid" }), messages.Mail.welcome.title],
      ["reset", createElement(Reset, { ...shared, resetUrl: actionUrl }), messages.Mail.resetPassword.title],
      ["magic", createElement(Magic, { ...shared, magicLink: actionUrl }), messages.Mail.magicLink.title],
      ["legacy-welcome", createElement(WelcomeEmail, { locale, name, translations: messages.Emails.welcome, appUrl: "https://mail-fixture.invalid" }), messages.Emails.welcome.title],
      ["legacy-reset", createElement(ResetPasswordEmail, { locale, name, translations: messages.Emails.resetPassword, resetUrl: actionUrl }), messages.Emails.resetPassword.title],
      ["auth-login", createElement(MagicLinkEmail, { firstName: name, actionUrl, mailType: "login", siteName: siteManifest.ui.brand.name }), "Sign in"],
      ["auth-register", createElement(MagicLinkEmail, { firstName: name, actionUrl, mailType: "register", siteName: siteManifest.ui.brand.name }), "Activate Account"],
    ];
    for (const [template, element, title] of templates) {
      const html = await render(element);
      const text = toPlainText(html);
      assert(html.includes("<html"));
      assert(text.includes(title));
      assert(text.includes(siteManifest.ui.brand.name));
      assert(!html.includes("<script>"));
      assert(html.includes("&lt;script&gt;"));
      assert(text.includes("中文"));
      if (template.includes("reset") || template.includes("magic") || template.startsWith("auth-")) {
        assert(html.includes(actionUrl.replaceAll("&", "&amp;")));
        assert(text.includes(actionUrl));
      }
      assert.equal(await runtimeRender(element), html);
      cases.push({ locale, template, htmlAndText: true });
    }
  }
  const originalFetch = globalThis.fetch;
  let sdkRequests = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.resend.com/emails");
    assert.equal(init?.method, "POST");
    const payload = JSON.parse(String(init.body));
    assert(payload.html.includes(actionUrl.replaceAll("&", "&amp;")));
    assert(!payload.html.includes("<script>"));
    sdkRequests++;
    return new Response(JSON.stringify({ id: "fixture-only-not-delivered" }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const { Resend } = await import("resend");
    const client = new Resend("re_fixture_not_a_real_key");
    const result = await client.emails.send({
      from: "fixture@mail.invalid", to: "fixture@recipient.invalid", subject: "Local fixture only",
      react: createElement(MagicLinkEmail, { firstName: name, actionUrl, mailType: "login", siteName: siteManifest.ui.brand.name }),
    });
    assert.equal(result.error, null);
    assert.equal(result.data?.id, "fixture-only-not-delivered");
    assert.equal(sdkRequests, 1);
  } finally { globalThis.fetch = originalFetch; }
  await mkdir(".local", { recursive: true });
  await writeFile(".local/aud010-email-results.json", JSON.stringify({ testedAt: new Date().toISOString(), renderer: "2.2.0", cases, sdkRequestsIntercepted: sdkRequests, realEmailsSent: 0 }, null, 2) + "\n");
  console.log(`PASS ${cases.length} email variants and actual SDK with intercepted HTTP: HTML/plain text, URLs, escaping, localization and unified renderer; no messages sent`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
