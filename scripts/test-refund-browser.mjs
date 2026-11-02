import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { parse } from "dotenv";
const require = createRequire(import.meta.url);
// Browser plugin/skill not available; use the installed Playwright runtime.
// Flow: admin order detail -> amount/reason confirmation -> disabled-provider
// response; query-only recovery and completed-refund ledger survive reload.
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const env = parse(await readFile(".env.local", "utf8"));
const fixtures = JSON.parse(
    await readFile(".local/refund-browser-fixtures.json", "utf8"),
  );
const base = "http://localhost:3000";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
const page = await context.newPage();
const errors = [];
const passed = [];
page.on("pageerror", (e) => errors.push(e.message));
const post = (path, data, origin = base) =>
  context.request.post(base + path, { data, headers: { Origin: origin } });
try {
  assert.equal(
    (
      await context.request.get(
        base + "/api/v1/admin/refunds/" + fixtures.stripe,
      )
    ).status(),
    401,
  );
  assert.equal((await post("/api/v1/admin/refunds", {})).status(), 401);
  assert.equal(
    (
      await post("/api/auth/sign-in/email", {
        email: env.LOCAL_MEMBER_EMAIL || "member@laconic.local",
        password: env.LOCAL_MEMBER_PASSWORD,
      })
    ).status(),
    200,
  );
  assert.equal((await post("/api/v1/admin/refunds", {})).status(), 403);
  await context.clearCookies();
  assert.equal(
    (
      await post("/api/auth/sign-in/email", {
        email: env.LOCAL_ADMIN_EMAIL,
        password: env.LOCAL_ADMIN_PASSWORD,
      })
    ).status(),
    200,
  );
  const input = {
    requestId: crypto.randomUUID(),
    orderId: fixtures.stripe,
    amount: 500,
    reason: "隔离后台测试退款权限与接口边界",
  };
  assert.equal(
    (
      await post("/api/v1/admin/refunds", input, "https://foreign.example")
    ).status(),
    403,
  );
  assert.equal(
    (await post("/api/v1/admin/refunds", { ...input, amount: 0 })).status(),
    400,
  );
  assert.equal(
    (
      await post("/api/v1/admin/refunds/recheck", {
        refundId: crypto.randomUUID(),
        externalId: "re_valid_123",
      })
    ).status(),
    404,
  );
  passed.push(
    "Real HTTP anonymous/member/admin/CSRF/invalid amount and Stripe refund-ID format boundaries",
  );
  for (const provider of ["stripe", "creem"]) {
    await page.goto(`${base}/zh/admin/orders/${fixtures[provider]}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("heading", { name: "订单退款与积分回收" }).waitFor();
    assert((await page.title()).length > 0);
    await page.getByLabel("退款金额（USD）").fill("2.50");
    await page
      .getByLabel("退款原因", { exact: true })
      .fill("隔离后台界面测试，只核对本地未配置通道");
    if (provider === "creem")
      assert(
        await page
          .getByRole("button", { name: "核对退款", exact: true })
          .isDisabled(),
      );
    await page.getByLabel("退款金额（USD）").fill("5.00");
    assert(
      await page
        .getByRole("button", { name: "核对退款", exact: true })
        .isEnabled(),
    );
    await page.getByRole("button", { name: "核对退款", exact: true }).click();
    assert((await page.locator("body").innerText()).includes("100"));
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/admin/refunds") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "确认提交 / 重试同一退款", exact: true })
      .click();
    assert.equal((await responsePromise).status(), 503);
    const v = (
      await (
        await context.request.get(
          base + "/api/v1/admin/refunds/" + fixtures[provider],
        )
      ).json()
    ).data;
    assert.equal(v.pkg.remainingCredits, 100);
    assert.equal(v.refunds.length, 0);
    await page.reload({ waitUntil: "networkidle" });
    assert(
      await page
        .getByRole("heading", { name: "订单退款与积分回收" })
        .isVisible(),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await mkdir(".local/refund-screenshots", { recursive: true });
    await page.screenshot({
      path: `.local/refund-screenshots/${provider}-desktop.png`,
      fullPage: true,
    });
  }
  passed.push(
    "Rendered Stripe refund confirmation and Creem full-only amount control; disabled real configuration returns 503 with zero credit hold/order mutation",
  );
  await page.goto(`${base}/zh/admin/orders/${fixtures.pending}`, {
    waitUntil: "networkidle",
  });
  const queryResponse = page.waitForResponse((r) =>
    r.url().endsWith("/api/v1/admin/refunds/recheck"),
  );
  await page.getByRole("button", { name: "只查询平台退款结果" }).click();
  assert.equal((await queryResponse).status(), 503);
  await page.goto(`${base}/zh/admin/orders/${fixtures.done}`, {
    waitUntil: "networkidle",
  });
  assert((await page.locator("body").innerText()).includes("退款成功"));
  await page.reload({ waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: ".local/refund-screenshots/refund-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  passed.push(
    "Query-only recovery button, completed refund/credit display after reload, desktop/mobile layout and no page exceptions",
  );
  await writeFile(
    "docs/project-state/refund-browser-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        passed,
        realProviderCalls: 0,
        providerFlagsRemainDisabled: true,
      },
      null,
      2,
    ),
  );
  console.log("PASS refund browser/API: " + passed.length + " groups");
} finally {
  await browser.close();
}
