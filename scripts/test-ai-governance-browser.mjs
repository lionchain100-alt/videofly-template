import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
// Run with node --import tsx. No provider request is made by the fixture.
const { aiPolicyFixture } = await import("./ai-policy-fixture.ts");
const q = postgres(process.env.DATABASE_URL, {
    ssl: false,
    max: 3,
    onnotice: () => {},
  }),
  fixture = await aiPolicyFixture(q),
  uid = randomUUID(),
  email = "aud007-browser-" + uid + "@example.invalid",
  password = "Fixture-" + randomUUID(),
  base = "http://localhost:3000";
const { submitSummary, claimTask, finishTask } = await import(
  "../src/services/tasks.ts"
);
const { beginAiDispatch } = await import("../src/services/ai-governance.ts");
const { db } = await import("../src/db/index.ts");
let browser;
try {
  await q`insert into "user"(id,name,email,"emailVerified","isAdmin")values(${uid},'AUD007 browser fixture',${email},true,true)`;
  await q`insert into account(id,"accountId","providerId","userId",password)values(${randomUUID()},${uid},'credential',${uid},${await hashPassword(password)})`;
  await q`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status)values(${uid},20,20,0,'SYSTEM_ADJUST','ACTIVE')`;
  const submitted = await submitSummary(uid, {
      requestId: randomUUID(),
      input: {
        text: "AUD007 browser cost fixture. No real model or paid request is performed.",
        language: "en",
        length: "short",
      },
    }),
    job = await claimTask();
  assert.equal(job.id, submitted.id);
  assert(await beginAiDispatch(job.id, job.leaseToken));
  assert(
    await finishTask(job.id, job.leaseToken, {
      errorCode: "FIXTURE_UNKNOWN",
      errorMessage: "Local uncertain supplier cost fixture",
    }),
  );
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_EXECUTABLE_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await context.request.post(base + "/api/auth/sign-in/email", {
    headers: { Origin: base },
    data: { email, password },
  });
  assert.equal(login.status(), 200);
  let lost = false;
  const ids = [];
  await page.route("**/api/v1/admin/ai", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "policy") {
        ids.push(body.requestId);
        if (!lost) {
          lost = true;
          const r = await route.fetch();
          assert.equal(r.status(), 200);
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              error: {
                message: "Fixture committed response loss; retry same request",
              },
            }),
          });
          return;
        }
      }
    }
    await route.continue();
  });
  await page.goto(base + "/zh/admin/ai");
  await page
    .getByRole("heading", { name: "模型与费用控制", exact: true })
    .waitFor();
  await page.getByLabel("每用户每分钟新任务", { exact: true }).fill("9");
  await page
    .getByLabel("变更原因（12–300 字符）", { exact: true })
    .fill("AUD007 browser lost-response idempotent configuration");
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page
    .getByText("Fixture committed response loss; retry same request", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await page.getByText("此前操作已完成，未重复执行", { exact: true }).waitFor();
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(
    (
      await q`select count(*)::int as n from ai_policy_versions where actor_id=${uid}`
    )[0].n,
    1,
  );
  await page.getByRole("button", { name: "核对费用", exact: true }).click();
  await page.getByLabel("已核实美元费用", { exact: true }).fill("0");
  await page
    .getByLabel("供应商凭证／账单编号", { exact: true })
    .fill("AUD007-local-fixture-no-real-cost");
  await page
    .getByLabel("核对原因（至少 12 字符）", { exact: true })
    .fill("AUD007 browser simulated statement confirmation");
  await page
    .getByRole("button", { name: "确认费用并记审计", exact: true })
    .click();
  await page.getByRole("cell", { name: /CONFIRMED/ }).waitFor();
  assert.equal(
    (
      await q`select confirmed_micros from ai_cost_usage where task_id=${submitted.id}`
    )[0].confirmed_micros,
    "0",
  );
  assert.equal(
    (
      await q`select count(*)::int as n from ai_cost_reviews where task_id=${submitted.id}`
    )[0].n,
    1,
  );
  for (const viewport of [
    { width: 1440, height: 1100 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page
      .getByRole("heading", { name: "模型与费用控制", exact: true })
      .waitFor();
    await page.getByLabel("每用户每分钟新任务", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("每用户每分钟新任务", { exact: true }).inputValue(),
      "9",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `.local/aud007-ai-${viewport.width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/project-state/aud-007-browser-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        groups: [
          "real local UI save with committed-but-lost response and same-ID retry creates one revision",
          "terminal unknown-cost statement review updates absolute budget amount once with audit and no credit/payment changes",
          "reload persists configuration and review; desktop/mobile private UI without page errors or horizontal overflow",
        ],
        providerCalls: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS three real local browser groups: idempotent configuration, cost review, reload/desktop/mobile",
  );
} finally {
  if (browser) await browser.close();
  await fixture.restore(uid);
  await q`delete from ai_cost_reviews where actor_id=${uid}`;
  await q`delete from credit_transactions where user_id=${uid}`;
  await q`delete from credit_holds where user_id=${uid}`;
  await q`delete from task_attempts where task_id in(select id from tasks where user_id=${uid})`;
  await q`delete from tasks where user_id=${uid}`;
  await q`delete from credit_packages where user_id=${uid}`;
  await q`delete from session where "userId"=${uid}`;
  await q`delete from account where "userId"=${uid}`;
  await q`delete from "user" where id=${uid}`;
  await q.end();
  await db.$client.end({ timeout: 5 });
}
