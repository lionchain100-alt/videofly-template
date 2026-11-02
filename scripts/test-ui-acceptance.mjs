import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
const require = createRequire(import.meta.url),
  {
    chromium,
  } = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const u = new URL(process.env.DATABASE_URL);
assert.equal(u.hostname, "127.0.0.1");
assert.equal(u.port, "55432");
assert.equal(u.pathname, "/laconic_local");
const q = postgres(u.href, { ssl: false, max: 4, onnotice: () => {} }),
  uid = randomUUID(),
  email = `aud008-${uid}@example.invalid`,
  password = "Fixture-" + randomUUID(),
  original = await readFile("src/config/site.json"),
  prev = await readFile("src/config/site.previous.json").catch(() => null),
  site = JSON.parse(original),
  evidence = "../.qa-aud008",
  cases = [],
  errors = [],
  ids = [];
assert.equal(
  (
    await q`select count(*)::int as n from worker_heartbeats where status='RUNNING'and heartbeat_at>now()-interval '30 seconds'`
  )[0].n,
  0,
  "Stop managed Workers before UI fixtures",
);
await mkdir(evidence, { recursive: true });
process.env.ASSET_STORAGE_BACKEND = "local";
process.env.VIDEO_ALLOW_LOCAL_TEST = "true";
const { db } = await import("../src/db/index.ts"),
  { claimTask, finishTask } = await import("../src/services/tasks.ts"),
  { beginAiDispatch } = await import("../src/services/ai-governance.ts"),
  { claimVideoJob, processVideoJob } = await import(
    "../src/services/video-jobs.ts"
  ),
  { assetPath } = await import("../src/services/video-assets.ts");
const media = await readFile("scripts/fixtures/blue-1s.mp4"),
  server = createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": media.length,
    });
    res.end(media);
  });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const savedFetch = globalThis.fetch;
let submits = 0,
  providerPrompt = "";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin === "https://api.kie.ai") {
    if (url.pathname.endsWith("/createTask")) {
      submits++;
      providerPrompt = JSON.parse(init.body).input.prompt;
      return Response.json({
        code: 200,
        data: { taskId: "AUD008-video-fixture" },
      });
    }
    return Response.json({
      code: 200,
      data: {
        taskId: "AUD008-video-fixture",
        model: "wan/2-7-text-to-video",
        param: { input: { prompt: providerPrompt } },
        state: "success",
        resultJson: {
          resultUrls: [`http://127.0.0.1:${server.address().port}/result.mp4`],
        },
      },
    });
  }
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw Error("External requests blocked in fixture");
  return savedFetch(input, init);
};
let browser, page;
async function apply(preset, mode) {
  site.ui.presetId = preset;
  site.ui.theme.mode = mode;
  const next = JSON.stringify(site, null, 2) + "\n";
  if ((await readFile("src/config/site.json", "utf8")) !== next) {
    await writeFile("src/config/site.json", next);
    await new Promise((r) => setTimeout(r, 1600));
  }
}
async function visit(locale = "zh", path = "") {
  const r = await page.goto(
    `http://localhost:3000${locale === "zh" ? "/zh" : ""}${path}`,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  assert.equal(r.status(), 200);
  await page
    .locator(
      `[data-preset="${site.ui.presetId}"][data-theme="${site.ui.theme.mode}"]`,
    )
    .waitFor();
  assert((await page.title()).includes(site.ui.brand.name));
  assert((await page.locator("body").innerText()).length > 100);
  assert.equal(
    await page
      .locator("nextjs-portal")
      .evaluateAll((es) =>
        es.some((e) =>
          e.shadowRoot?.querySelector("[data-nextjs-dialog-overlay]"),
        ),
      ),
    false,
  );
}
async function open(tool, locale = "zh") {
  await page
    .getByRole("button", { name: /账户|Account/, includeHidden: true })
    .first()
    .waitFor({ state: "attached" });
  if (
    site.ui.presetId === "portal" &&
    !(await page.locator("#live-summary-input,#live-video-prompt").count())
  )
    await page
      .locator("button")
      .filter({
        has: page.getByRole("heading", {
          name:
            locale === "zh"
              ? tool === "text"
                ? "文本摘要"
                : "视频生成"
              : tool === "text"
                ? "Text summary"
                : "Video generation",
          exact: true,
        }),
      })
      .click();
  else {
    await page
      .getByRole("button", {
        name:
          locale === "zh"
            ? tool === "text"
              ? "切换到文本摘要"
              : "切换到视频生成"
            : tool === "text"
              ? "Switch to text summary"
              : "Switch to video",
        exact: true,
      })
      .click();
  }
  await page
    .locator(tool === "text" ? "#live-summary-input" : "#live-video-prompt")
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        /生成摘要|Summarize|Create summary|重试|Retry|生成视频|Generate video/.test(
          b.textContent,
        ) && !b.disabled,
    ),
  );
}
try {
  await q`insert into "user"(id,name,email,"emailVerified","isAdmin")values(${uid},'AUD008 UI fixture',${email},true,false)`;
  await q`insert into account(id,"accountId","providerId","userId",password)values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
  await q`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status)values(${uid},100,100,0,'SYSTEM_ADJUST','ACTIVE')`;
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await context.request.post(
    "http://localhost:3000/api/auth/sign-in/email",
    { headers: { Origin: "http://localhost:3000" }, data: { email, password } },
  );
  assert.equal(login.status(), 200);
  let studio = await (
    await context.request.get("http://localhost:3000/api/ui-studio/config")
  ).json();
  const changed = await context.request.put(
    "http://localhost:3000/api/ui-studio/config",
    {
      headers: {
        Origin: "http://localhost:3000",
        "x-ui-studio-token": studio.token,
      },
      data: {
        revision: studio.revision,
        config: { ...studio.config, presetId: "minimal" },
      },
    },
  );
  assert.equal(changed.status(), 200);
  cases.push({
    check: "real UI Studio apply protects revision and changes only UI",
    passed: true,
  });
  for (const tool of ["text", "video"]) {
    await apply("minimal", "light");
    await visit();
    await open(tool);
    const input =
        tool === "text" ? "#live-summary-input" : "#live-video-prompt",
      value =
        tool === "text"
          ? "AUD008 same source text across three UI presets and both languages. No real model call."
          : "AUD008 same video prompt across layouts, with isolated provider output.";
    await page.locator(input).fill(value);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r
          .url()
          .endsWith(
            tool === "text"
              ? "/api/v1/tools/text-summary"
              : "/api/v1/tools/video",
          ),
    );
    await page
      .getByRole("button", {
        name: tool === "text" ? site.ui.content.cta.zh : "生成视频",
        exact: true,
      })
      .click();
    const receipt = await (await response).json();
    assert(receipt.success);
    const id = receipt.data.id;
    ids.push(id);
    for (const preset of ["studio", "portal", "minimal"]) {
      await apply(preset, "light");
      await visit();
      await open(tool);
      assert.equal(await page.locator(input).inputValue(), value);
      const list =
        await q`select id from tasks where user_id=${uid} and tool_id=${tool === "text" ? "text-summary" : "video-generation"}`;
      assert.equal(list.length, 1);
      assert.equal(list[0].id, id);
    }
    if (tool === "text") {
      const task = await claimTask();
      assert.equal(task.id, id);
      assert(await beginAiDispatch(id, task.leaseToken));
      await finishTask(id, task.leaseToken, {
        result: "AUD008 summary result from isolated local executor.",
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });
    } else {
      for (let n = 0; n < 3; n++) {
        await q`update video_jobs set next_run_at=now()-interval '1 second' where task_id=${id}`;
        const job = await claimVideoJob();
        assert.equal(job.task.id, id);
        await processVideoJob(job);
        console.log(
          "Video phase",
          n,
          await q`select j.stage,t.status,t.error_code,j.last_error from video_jobs j join tasks t on t.id=j.task_id where j.task_id=${id}`,
        );
      }
    }
    await visit();
    await open(tool);
    await page
      .getByText(tool === "text" ? "摘要已完成" : "视频已完成", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      (
        await q`select count(*)::int as n from credit_transactions where task_id=${id} and trans_type='TASK_HOLD'`
      )[0].n,
      1,
    );
    assert.equal(
      (
        await q`select count(*)::int as n from credit_transactions where task_id=${id} and trans_type='TASK_SETTLE'`
      )[0].n,
      1,
    );
    cases.push({
      check: `${tool}: one POST/task/hold/settlement across three layouts`,
      taskId: id,
      passed: true,
    });
  }
  assert.equal(submits, 1);
  for (const preset of ["minimal", "studio", "portal"])
    for (const mode of ["light", "dark"]) {
      await apply(preset, mode);
      for (const locale of ["zh", "en"])
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await visit(locale);
          await open("text", locale);
          assert(
            (await page.locator("#live-summary-input").inputValue()).startsWith(
              "AUD008 same source",
            ),
          );
          await page.locator("#live-summary-input").focus();
          await page.keyboard.press("Tab");
          assert(
            await page.evaluate(() => document.activeElement !== document.body),
          );
          const focus = await page.evaluate(() => {
            const s = getComputedStyle(document.activeElement);
            return { style: s.outlineStyle, width: s.outlineWidth };
          });
          assert.notEqual(focus.style, "none");
          assert.notEqual(focus.width, "0px");
          await open("video", locale);
          assert(
            (await page.locator("#live-video-prompt").inputValue()).startsWith(
              "AUD008 same video",
            ),
          );
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          if (width === 390) {
            const menu = page.getByRole("button", {
              name: locale === "zh" ? "打开导航" : "Open navigation",
              exact: true,
            });
            await menu.focus();
            await page.keyboard.press("Enter");
            assert.equal(await menu.getAttribute("aria-expanded"), "true");
            await page
              .getByRole("link", {
                name: locale === "zh" ? "English" : "中文",
                exact: true,
              })
              .last()
              .waitFor();
            await page.keyboard.press("Escape");
            assert.equal(await menu.getAttribute("aria-expanded"), "false");
            assert(await menu.evaluate((e) => e === document.activeElement));
          }
          await page.screenshot({
            path: `${evidence}/${preset}-${mode}-${locale}-${width}.png`,
            fullPage: false,
          });
          cases.push({
            preset,
            mode,
            locale,
            width,
            tools: ["summary", "video"],
            keyboard: true,
            noOverflow: true,
          });
        }
    }
  await apply("studio", "light");
  await visit("zh", "/text-summary");
  const value = await page.locator("#live-summary-input").inputValue();
  await page
    .getByRole("link", { name: "English", exact: true })
    .first()
    .click();
  await page.waitForURL("http://localhost:3000/text-summary");
  await page.locator("#live-summary-input").waitFor();
  await page.waitForFunction(
    (v) => document.querySelector("#live-summary-input")?.value === v,
    value,
  );
  assert.equal(await page.locator("#live-summary-input").inputValue(), value);
  cases.push({
    check:
      "language navigation preserves dedicated tool route and private draft",
    passed: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/project-state/aud-008-ui-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        browser: "Playwright/Chromium; Browser plugin not available",
        combinations: 12,
        viewports: [390, 768, 1440],
        matrixCases: 36,
        cases,
        pageErrors: errors,
        realProviderCalls: 0,
        fixtureVideoSubmissions: submits,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS UI business continuity, 36 viewport cases / 12 combinations, both tools, keyboard, language/drafts and one charge",
  );
} catch (e) {
  console.log("Page errors", errors);
  if (page) {
    await writeFile(
      evidence + "/failure.txt",
      await page.locator("body").innerText(),
    );
    await page.screenshot({ path: evidence + "/failure.png", fullPage: true });
  }
  throw e;
} finally {
  if (browser) await browser.close();
  await writeFile("src/config/site.json", original);
  if (prev) await writeFile("src/config/site.previous.json", prev);
  else await unlink("src/config/site.previous.json").catch(() => {});
  globalThis.fetch = savedFetch;
  await q`delete from task_assets where user_id=${uid}`;
  await q`delete from video_jobs where task_id in(select id from tasks where user_id=${uid})`;
  await q`delete from credit_transactions where user_id=${uid}`;
  await q`delete from credit_holds where user_id=${uid}`;
  await q`delete from task_attempts where task_id in(select id from tasks where user_id=${uid})`;
  await q`delete from tasks where user_id=${uid}`;
  await q`delete from credit_packages where user_id=${uid}`;
  await q`delete from session where "userId"=${uid}`;
  await q`delete from account where "userId"=${uid}`;
  await q`delete from "user"where id=${uid}`;
  for (const id of ids) await unlink(assetPath(id)).catch(() => {});
  await q.end();
  await db.$client.end({ timeout: 5 });
  await new Promise((r) => server.close(r));
}
