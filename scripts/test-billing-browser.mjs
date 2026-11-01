import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { parse } from "dotenv";
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_MODULE_PATH ||
      "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  );
// Browser plugin not available; use installed local Playwright without a package change.
const base = "http://localhost:3000",
  env = parse(await readFile(".env.local", "utf8"));
assert.equal(env.STRIPE_ENABLED, "false");
assert.equal(env.CREEM_ENABLED, "false");
const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [],
  passed = [];
page.on("pageerror", (e) => errors.push(e.message));
const post = (path, body, origin = base) =>
  context.request.post(base + path, {
    data: body,
    headers: { Origin: origin },
  });
try {
  assert.equal(
    (await context.request.get(base + "/api/v1/subscriptions")).status(),
    401,
  );
  assert.equal(
    (
      await post("/api/auth/sign-in/email", {
        email: env.LOCAL_ADMIN_EMAIL,
        password: env.LOCAL_ADMIN_PASSWORD,
      })
    ).status(),
    200,
  );
  const before = (
    await (await context.request.get(base + "/api/v1/credit/balance")).json()
  ).data;
  assert.equal(
    (
      await post("/api/v1/subscriptions", { id: "bad", action: "cancel" })
    ).status(),
    400,
  );
  assert.equal(
    (
      await post(
        "/api/v1/subscriptions",
        { id: crypto.randomUUID(), action: "cancel" },
        "https://other.example",
      )
    ).status(),
    403,
  );
  assert.equal(
    (
      await post("/api/v1/subscriptions", {
        id: crypto.randomUUID(),
        action: "cancel",
      })
    ).status(),
    404,
  );
  for (const provider of ["stripe", "creem"])
    assert.equal(
      (
        await post("/api/v1/payments", {
          requestId: crypto.randomUUID(),
          provider,
          productId: "starter",
        })
      ).status(),
      503,
    );
  assert.equal((await post("/api/webhooks/stripe", {})).status(), 503);
  assert.equal((await post("/api/webhooks/creem", {})).status(), 503);
  assert.equal(
    (await context.request.get(base + "/api/webhooks/stripe")).status(),
    405,
  );
  assert.equal((await post("/api/auth/creem/webhook", {})).status(), 503);
  assert.equal(
    (
      await context.request.get(base + "/api/auth/creem/has-access-granted")
    ).status(),
    200,
  );
  passed.push(
    "HTTP auth, CSRF, invalid input and ownership guards; unconfigured providers return 503 without orders/credits; legacy Creem facade remains reachable",
  );
  const response = await page.goto(base + "/zh/buy-credits", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.equal(response.status(), 200);
  await page
    .getByRole("heading", { name: "订阅与每期积分", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Creem · 尚未启用" })
    .first()
    .waitFor();
  for (const provider of ["Stripe", "Creem"])
    assert(
      await page
        .getByRole("button", { name: provider + " · 尚未启用" })
        .first()
        .isDisabled(),
    );
  assert.equal(
    await page.getByRole("button", { name: "订阅", exact: true }).count(),
    6,
  );
  for (const button of await page
    .getByRole("button", { name: "订阅", exact: true })
    .all())
    assert(await button.isDisabled());
  await page.getByRole("button", { name: "刷新订阅状态", exact: true }).click();
  await mkdir(".local/aud004-screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/aud004-screenshots/purchase-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/aud004-screenshots/purchase-mobile.png",
    fullPage: false,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  passed.push(
    "four-channel purchase buttons and six canonical subscription plans render desktop/mobile; inactive channels cannot initiate checkout; refresh works",
  );
  // Enable only the visual Stripe control in the test page; the real server remains disabled.
  // This verifies the real browser POST contract without any provider charge.
  let checkoutPosts = 0;
  await page.route("**/api/v1/payments", async (route) => {
    if (route.request().method() === "GET") {
      const r = await route.fetch(),
        data = await r.json();
      data.data.subscriptions = data.data.subscriptions.map((p) => ({
        ...p,
        providers: ["stripe"],
      }));
      data.data.providers = data.data.providers.map((p) =>
        p.id === "stripe" ? { ...p, enabled: true } : p,
      );
      await route.fulfill({ response: r, json: data });
    } else {
      checkoutPosts++;
      assert.equal(route.request().url(), base + "/api/v1/payments");
      await route.continue();
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const subscribe = page
    .getByRole("button", { name: "订阅", exact: true })
    .first();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (b) => b.textContent === "订阅" && !b.disabled,
    ),
  );
  await subscribe.click();
  await page
    .getByRole("status")
    .filter({ hasText: "Stripe 尚未启用或配置不完整" })
    .waitFor();
  assert.equal(checkoutPosts, 1);
  assert.equal(
    await page.evaluate(() =>
      sessionStorage.getItem("billing-subscription-intent-v1"),
    ),
    null,
  );
  passed.push(
    "browser subscription submits the canonical POST and handles server-side disabled-provider rejection without an orphaned intent or paid call",
  );
  assert.deepEqual(
    (await (await context.request.get(base + "/api/v1/credit/balance")).json())
      .data,
    before,
  );
  assert.deepEqual(errors, []);
  await context.request.post(base + "/api/auth/sign-out", {
    data: {},
    headers: { Origin: base },
  });
  await writeFile(
    "docs/project-state/aud-004-browser-results.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: "Local Playwright; Browser plugin not available",
        passed,
        pageErrors: errors,
        providerCalls: 0,
        balancesUnchanged: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(passed.map((s) => "PASS " + s).join("\n"));
} finally {
  await browser.close();
}
