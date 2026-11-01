import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
const require = createRequire(import.meta.url);
// Browser plugin not available in this session; use the installed local Playwright runtime.
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = fileURLToPath(new URL("../", import.meta.url)),
  second = path.resolve(root, "../sites/aurora-notes");
const configFile = path.join(second, "src/config/site.json"),
  raw = await readFile(configFile, "utf8");
const mainFile = path.join(root, "src/config/site.json"),
  mainRaw = await readFile(mainFile, "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [],
  passed = [];
page.on("pageerror", (e) => errors.push(e.message));
const evidence = path.join(root, ".local/aud003-screenshots");
await mkdir(evidence, { recursive: true });
const pass = (m) => {
  passed.push(m);
  console.log("PASS " + m);
};
async function visit(url) {
  const r = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  assert.equal(r.status(), 200, `Page ${url}`);
  await page.locator("body").waitFor();
  assert(!(await page.title()).includes("500"));
}
try {
  await visit("http://localhost:3002/login");
  const env = parse(await readFile(path.join(second, ".env.local"), "utf8"));
  // Avoid printing credential-filled locators or Playwright's form-action logs.
  const signed = await context.request.post(
    "http://localhost:3002/api/auth/sign-in/email",
    {
      data: {
        email: env.LOCAL_ADMIN_EMAIL,
        password: env.LOCAL_ADMIN_PASSWORD,
      },
      headers: { Origin: "http://localhost:3002" },
    },
  );
  assert.equal(signed.status(), 200);
  await visit("http://localhost:3002/admin");
  assert((await page.locator("body").innerText()).includes("Aurora Notes"));
  await page.getByRole("link", { name: "用户管理", exact: true }).click();
  await page.waitForURL("**/admin/users");
  assert(!page.url().includes("/zh/"));
  assert(!(await page.locator("body").innerText()).includes("VideoFly"));
  pass(
    "second-site admin login, branding and default-Chinese navigation without hardcoded locale prefix",
  );
  await visit("http://localhost:3002/ui-studio");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("button")).some(
      (button) =>
        button.textContent?.includes("应用到本地站点") && !button.disabled,
    ),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "first-site-ui.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(JSON.parse(mainRaw).ui)),
  });
  await page
    .getByText("导入成功，已载入草稿。点击应用后才会改变站点。", {
      exact: true,
    })
    .waitFor();
  for (const [preset, label] of [
    ["minimal", "简洁单工具"],
    ["studio", "创作工作台"],
    ["portal", "多工具门户"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("站点名称", { exact: true }).fill("Aurora Notes");
    const [applied] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/ui-studio/config") &&
          r.request().method() === "PUT",
      ),
      page.getByRole("button", { name: "应用到本地站点", exact: true }).click(),
    ]);
    assert.equal(applied.status(), 200);
    await applied.finished();
    await page
      .getByText(
        "已应用到本地站点，并备份上一版。刷新首页即可查看，重启后仍保留。",
        { exact: true },
      )
      .waitFor({ timeout: 30000 });
    const stored = JSON.parse(await readFile(configFile, "utf8"));
    assert.equal(stored.ui.presetId, preset);
    assert.equal(stored.tools["video-generation"], false);
    const home = await context.newPage();
    home.on("pageerror", (e) => errors.push(e.message));
    await home.goto("http://localhost:3002/", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await home.locator(`[data-preset="${preset}"]`).waitFor();
    assert.equal(
      await home
        .getByRole("button", { name: /切换到视频生成|Switch to video/ })
        .count(),
      0,
    );
    assert.equal(await home.locator('a[href*="text-to-video"]').count(), 0);
    assert.equal(
      await home.getByRole("button", { name: "视频生成", exact: true }).count(),
      0,
    );
    await home.screenshot({
      path: path.join(evidence, `second-${preset}-desktop.png`),
      fullPage: false,
    });
    await home.setViewportSize({ width: 390, height: 844 });
    await home.screenshot({
      path: path.join(evidence, `second-${preset}-mobile.png`),
      fullPage: false,
    });
    assert(
      await home.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 2,
      ),
      "Mobile horizontal overflow",
    );
    await home.close();
  }
  pass(
    "all three presets switch, save and render desktop/mobile with video entry absent and site policy preserved",
  );
  const result = await page.request.get("http://localhost:3002/text-to-video");
  assert.equal(result.status(), 404);
  assert.equal(
    (await page.request.get("http://localhost:3002/en/login")).status(),
    404,
  );
  const map = await page.request.get("http://localhost:3002/sitemap.xml");
  assert.equal(map.status(), 200);
  const xml = await map.text();
  assert(!xml.includes("/text-to-video"));
  assert(!xml.includes("/en/"));
  pass(
    "disabled video routes, disabled English routes and sitemap follow second-site configuration",
  );
  // Verify both-off empty state on all three layouts; never submit a task.
  for (const preset of ["minimal", "studio", "portal"]) {
    const main = JSON.parse(mainRaw);
    main.tools = { "text-summary": false, "video-generation": false };
    main.ui.presetId = preset;
    await writeFile(mainFile, JSON.stringify(main, null, 2) + "\n");
    await visit("http://localhost:3000/zh");
    await page.locator(`[data-preset="${preset}"]`).waitFor();
    if (preset === "portal") {
      assert.equal(
        await page
          .getByRole("button", { name: "文本摘要", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "视频生成", exact: true })
          .count(),
        0,
      );
    } else
      await page
        .getByRole("status")
        .filter({ hasText: "本站暂未开放工具" })
        .waitFor();
  }
  pass(
    "both tools disabled in every main-site preset: no executable workspace or tool entry remains",
  );
  assert.deepEqual(errors, [], "Browser page exceptions");
} finally {
  await writeFile(configFile, raw);
  await writeFile(mainFile, mainRaw);
  await browser.close();
}
await writeFile(
  path.join(root, "docs/project-state/aud-003-browser-results.json"),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      browser: "Local Playwright (Browser plugin not available)",
      passed,
      pageErrors: errors,
      evidenceDirectory: ".local/aud003-screenshots",
      configurationRestored: true,
    },
    null,
    2,
  ) + "\n",
);
