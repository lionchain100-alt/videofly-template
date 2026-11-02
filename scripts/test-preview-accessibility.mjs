import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const {
    chromium,
  } = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const { defaultConfig, readableAccent, contrastText } = await import(
    "../src/ui-presets/config.ts"
  );
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const apiCalls = [];
const errors = [];
const cases = [];
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/v1/")) apiCalls.push(r.url());
});
page.on("pageerror", (e) => errors.push(e.message));
const luminance = (hex) => {
    const rgb = hex
      .match(/[a-f0-9]{2}/gi)
      .map((x) => Number.parseInt(x, 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
const ratio = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) /
    (Math.min(luminance(a), luminance(b)) + 0.05);
try {
  await page.addInitScript(() =>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "laconic:ready") window.__previewReady = true;
    }),
  );
  const r = await page.goto("http://localhost:3000/ui-preview");
  assert.equal(r.status(), 200);
  await page.waitForFunction(() => window.__previewReady === true);
  for (const preset of ["minimal", "studio", "portal"])
    for (const mode of ["light", "dark"])
      for (const locale of ["zh", "en"]) {
        const config = defaultConfig(preset);
        config.theme.mode = mode;
        await page.evaluate(
          ({ config, locale }) =>
            window.postMessage(
              { type: "laconic:config", config, locale, scenario: "empty" },
              location.origin,
            ),
          { config, locale },
        );
        await page
          .locator(`[data-preset="${preset}"][data-theme="${mode}"]`)
          .waitFor();
        const bg = mode === "dark" ? "#14161d" : config.theme.background;
        assert(ratio(readableAccent(config.theme.accent, bg), bg) >= 4.5);
        assert(
          ratio(contrastText(config.theme.accent), config.theme.accent) >= 4.5,
        );
        for (const label of locale === "zh"
          ? ["登录", "价格", "最近创作"]
          : ["Sign in", "Pricing", "Recent work"]) {
          const login = page
            .getByRole("button", { name: label, exact: true })
            .first();
          await login.focus();
          const opener = await login.elementHandle();
          await page.keyboard.press("Enter");
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          await page.keyboard.press("Tab");
          assert(
            await dialog.evaluate((e) => e.contains(document.activeElement)),
          );
          await page.keyboard.press("Shift+Tab");
          assert(
            await dialog.evaluate((e) => e.contains(document.activeElement)),
          );
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
          await page.waitForFunction(
            (e) => document.activeElement === e,
            opener,
          );
          assert(await login.evaluate((e) => e === document.activeElement));
        }
        cases.push({
          preset,
          mode,
          locale,
          dialogKeyboardTrapAndReturn: true,
          dialogs: 3,
          accentAndButtonContrastAA: true,
        });
      }
  await page.setViewportSize({width:390,height:844});await page.evaluate(config=>window.postMessage({type:'laconic:config',config,locale:'zh',scenario:'empty'},location.origin),defaultConfig('minimal'));const menu=page.getByRole('button',{name:'打开导航',exact:true});await menu.focus();await page.keyboard.press('Enter');await page.getByRole('navigation').getByRole('button',{name:'登录',exact:true}).last().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='打开导航');
  assert.deepEqual(errors, []);
  assert.deepEqual(apiCalls, []);
  await writeFile(
    "docs/project-state/aud-008-accessibility-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        cases,
        businessApiCalls: 0,
        pageErrors: errors,
        scope:
          "Shared modal keyboard behavior and accent/button token contrast; not a full WCAG certification",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS 12 preview modal/keyboard/contrast combinations; zero database/business API calls",
  );
} finally {
  await browser.close();
}
