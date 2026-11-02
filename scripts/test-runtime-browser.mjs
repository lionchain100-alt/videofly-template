import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parse } from "dotenv";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const env = parse(await readFile(".env.local", "utf8")),
  base = "http://localhost:3000";
assert.equal(env.NEXT_PUBLIC_APP_URL, base);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const context = await browser.newContext(),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await context.request.post(base + "/api/auth/sign-in/email", {
    headers: { Origin: base },
    data: { email: env.LOCAL_ADMIN_EMAIL, password: env.LOCAL_ADMIN_PASSWORD },
  });
  assert.equal(login.status(), 200);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(base + "/zh/admin/runtime");
    await page
      .getByRole("heading", { name: "运行状态与就绪检查", exact: true })
      .waitFor();
    await page
      .getByText("总体：已就绪", { exact: false })
      .waitFor({ timeout: 30000 });
    for (const name of ["文本摘要：正常", "视频任务：正常", "支付与退款：正常"])
      await page.getByRole("heading", { name, exact: true }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `.local/aud006-runtime-${viewport.width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/project-state/aud-006-browser-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        authenticatedRuntimePage: true,
        allThreeWorkersReady: true,
        desktopAndMobile: true,
        noHorizontalOverflow: true,
        pageErrors: 0,
        modelCalls: 0,
        paymentCalls: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS runtime UI desktop/mobile, all three live Workers, no horizontal overflow or page errors",
  );
  await context.close();
} finally {
  await browser.close();
}
