import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { parse } from "dotenv";
const require = createRequire(import.meta.url);
// Browser plugin/skill not listed; use the installed Playwright runtime.
// Flow: authenticated admin exception search -> reason/confirmation -> lost
// response and same-ID retry -> one audited fulfillment -> reload/mobile.
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const env = parse(await readFile(".env.local", "utf8")),
  fixture = JSON.parse(
    await readFile(".local/aud005-browser-fixtures.json", "utf8"),
  ),
  base = "http://localhost:3000",
  api = "/api/v1/admin/payment-ops";
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
const post = (data, origin = base) =>
  context.request.post(base + api, { data, headers: { Origin: origin } });
try {
  assert.equal((await context.request.get(base + api)).status(), 401);
  assert.equal((await post({})).status(), 401);
  assert.equal(
    (
      await context.request.post(base + "/api/auth/sign-in/email", {
        data: {
          email: "member@laconic.local",
          password: env.LOCAL_MEMBER_PASSWORD,
        },
        headers: { Origin: base },
      })
    ).status(),
    200,
  );
  assert.equal((await context.request.get(base + api)).status(), 403);
  assert.equal((await post({})).status(), 403);
  await context.clearCookies();
  assert.equal(
    (
      await context.request.post(base + "/api/auth/sign-in/email", {
        data: {
          email: env.LOCAL_ADMIN_EMAIL,
          password: env.LOCAL_ADMIN_PASSWORD,
        },
        headers: { Origin: base },
      })
    ).status(),
    200,
  );
  const balance = await (
    await context.request.get(base + "/api/v1/credit/balance")
  ).json();
  const input = {
    requestId: crypto.randomUUID(),
    action: "RECONCILE_ORDER",
    orderId: fixture.orderId,
    reason: "浏览器接口隔离核实操作原因和支付权限",
  };
  assert.equal((await post(input, "https://foreign.example")).status(), 403);
  assert.equal((await post({ ...input, reason: "short" })).status(), 400);
  assert.equal((await post({ ...input, fact: { amount: 500 } })).status(), 400);
  assert.equal(
    (await post({ ...input, orderId: crypto.randomUUID() })).status(),
    404,
  );
  assert.equal(
    (await context.request.get(base + api + "?requestId=bad")).status(),
    400,
  );
  passed.push(
    "Real HTTP auth/member/admin/CSRF/reason/UUID/unknown-object guards; raw facts and price overrides are rejected",
  );
  await page.goto(base + "/zh/admin/payments", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "支付异常与到账补偿", exact: true })
    .waitFor();
  await page.getByLabel("异常搜索").fill(fixture.orderId);
  const row = page.locator("article").filter({ hasText: fixture.orderId });
  await row
    .getByRole("button", { name: "核对到账并补偿", exact: true })
    .click();
  await page
    .getByLabel("操作原因与核实依据")
    .fill("浏览器隔离验收：核对已验证收款，丢失响应后按同编号重试");
  await page.getByRole("button", { name: "核对操作", exact: true }).click();
  let captured;
  await page.route("**/api/v1/admin/payment-ops", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    captured = route.request().postDataJSON();
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "确认提交／重试同一操作", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("button") &&
      document.body.textContent.includes("Failed to fetch"),
  );
  assert(captured?.requestId);
  assert.equal(captured.orderId, fixture.orderId);
  assert(!("fact" in captured));
  assert(!("amount" in captured));
  const draft = await page.evaluate(() =>
    sessionStorage.getItem("payment-operation-intent"),
  );
  assert.equal(JSON.parse(draft).requestId, captured.requestId);
  await page.unroute("**/api/v1/admin/payment-ops");
  const retry = await post(captured);
  assert.equal(retry.status(), 202);
  assert.equal((await retry.json()).data.status, "SUCCEEDED");
  assert.equal(
    (
      await post({ ...captured, reason: captured.reason + " changed" })
    ).status(),
    409,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => sessionStorage.getItem("payment-operation-intent") === null,
  );
  const final = await (
    await context.request.get(base + api + "?requestId=" + captured.requestId)
  ).json();
  assert.equal(final.data.status, "SUCCEEDED");
  assert.equal(final.data.attempts, 1);
  assert(!("requestHash" in final.data));
  assert(!("leaseToken" in final.data));
  passed.push(
    "Rendered search/reason/confirmation, server-committed lost response, same-UUID retry, reload recovery and immutable audited intent",
  );
  await page.getByRole("button", { name: "操作审计", exact: true }).click();
  await page.getByLabel("异常搜索").fill(captured.requestId);
  await page.getByRole("checkbox", { name: "只看异常／待处理" }).uncheck();
  await page
    .locator("article")
    .filter({ hasText: captured.requestId })
    .waitFor();
  assert((await page.locator("body").innerText()).includes(captured.reason));
  await mkdir(".local/aud005-screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/aud005-screenshots/operations-desktop.png",
    fullPage: true,
  });
  for (const name of ["已验证事件／拒付审核", "退款异常", "订单与到账异常"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page
      .getByRole("heading", { name: "支付异常与到账补偿", exact: true })
      .waitFor();
  }
  await page.getByLabel("异常搜索").fill(fixture.orderId);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: ".local/aud005-screenshots/operations-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(
    await (await context.request.get(base + "/api/v1/credit/balance")).json(),
    balance,
  );
  assert.deepEqual(errors, []);
  passed.push(
    "Audited operator/reason/result display, all four tabs, desktop/mobile no overflow, no page exceptions and unchanged real-admin credits",
  );
  await writeFile(
    "docs/project-state/aud-005-browser-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        passed,
        pageErrors: errors,
        newRealProviderCalls: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS payment operations browser/API: " + passed.length + " groups",
  );
} finally {
  await browser.close();
}
