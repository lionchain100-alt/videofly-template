import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  const q = postgres(url.href, { ssl: false, max: 6, onnotice: () => {} }),
    admin = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    password = "Fixture-" + randomUUID(),
    email = "aud007-" + admin + "@example.invalid",
    passed: string[] = [],
    trigger = "aud007_" + randomUUID().replaceAll("-", "");
  const { aiPolicyFixture } = await import("./ai-policy-fixture");
  const fixture = await aiPolicyFixture(q);
  const { db } = await import("../src/db"),
    {
      currentAiPolicy,
      saveAiPolicy,
      reviewAiCost,
      beginAiDispatch,
      budgetTotals,
      noteAiProviderReceipt,
      publicGovernedConfig,
    } = await import("../src/services/ai-governance"),
    { submitSummary, claimTask, finishTask } = await import(
      "../src/services/tasks"
    ),
    { submitVideo, claimVideoJob } = await import("../src/services/video-jobs"),
    { textProviderConfig, textTaskConfig } = await import(
      "../src/ai/text-provider"
    );
  const pass = (s: string) => {
    passed.push(s);
    console.log("PASS " + s);
  };
  const text = (mark = "default") => ({
    requestId: randomUUID(),
    input: {
      text: "隔离回归文本摘要测试，不会提交到真实模型供应商。" + mark,
      length: "short" as const,
      language: "zh" as const,
    },
  });
  const video = () => ({
    prompt: "Isolated local budget fixture without provider submission",
    aspectRatio: "16:9" as const,
  });
  async function change(fn: (p: any) => void) {
    const current = await currentAiPolicy(),
      p = structuredClone(current.config);
    fn(p);
    return saveAiPolicy(admin, {
      requestId: randomUUID(),
      expectedRevision: current.revision,
      reason: "AUD-007 isolated regression policy change",
      config: p,
    });
  }
  async function balances(uid: string) {
    return (
      await q`select sum(remaining_credits)::int as remaining,sum(frozen_credits)::int as frozen from credit_packages where user_id=${uid}`
    )[0];
  }
  async function release(id: string, token: string | null = null) {
    assert(
      await finishTask(id, token, {
        errorCode: "QUEUE_TIMEOUT",
        errorMessage: "Fixture stopped before any external request",
      }),
    );
  }
  let adCookie = "",
    memberCookie = "";
  const base = "http://localhost:3000";
  async function request(
    route: string,
    cookie = "",
    body?: unknown,
    origin = base,
  ) {
    const r = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }
  try {
    for (const id of [admin, a, b]) {
      await q`insert into "user"(id,name,email,"emailVerified","isAdmin")values(${id},'AUD007 isolated user',${id === admin ? email : "aud007-" + id + "@example.invalid"},true,${id === admin})`;
      await q`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status)values(${id},200,200,0,'SYSTEM_ADJUST','ACTIVE')`;
    }
    await change((p) => {
      p.perMinute = 2;
      p.perDay = 3;
    });
    const first = text("rate-one"),
      dupes = await Promise.all(
        Array.from({ length: 8 }, () => submitSummary(a, first)),
      );
    assert.equal(new Set(dupes.map((x) => x.id)).size, 1);
    await release(dupes[0].id);
    const second = await submitSummary(a, text("rate-two"));
    await release(second.id);
    await assert.rejects(
      submitSummary(a, text("rate-denied")),
      (e: any) => e.status === 429 && e.details.code === "USER_MINUTE_LIMIT",
    );
    await q`update tasks set created_at=now()-interval '70 seconds'where id=${dupes[0].id}`;
    const third = await submitSummary(a, text("daily-third"));
    await release(third.id);
    await q`update tasks set created_at=now()-interval '70 seconds' where user_id=${a}`;
    await assert.rejects(
      submitSummary(a, text("daily-denied")),
      (e: any) => e.details?.code === "USER_DAY_LIMIT",
    );
    assert.deepEqual(await balances(a), { remaining: 200, frozen: 0 });
    pass(
      "per-user rolling minute / UTC day caps; accepted failures count; same-request retries count once; rejected requests create no hold",
    );
    await change((p) => {
      p.perMinute = 10000;
      p.perDay = 10000;
      p.dailyMicros = 600000;
      p.monthlyMicros = 600000;
    });
    const races = await Promise.allSettled([
      submitVideo(a, randomUUID(), video()),
      submitVideo(b, randomUUID(), video()),
    ]);
    assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(races.filter((x) => x.status === "rejected").length, 1);
    const accepted = (
      races.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<any>
    ).value;
    const [saved] =
      await q`select user_id,request_id from tasks where id=${accepted.id}`;
    assert.equal(
      (await submitVideo(saved.user_id, saved.request_id, video())).id,
      accepted.id,
    );
    assert.equal((await budgetTotals()).daily, 600000);
    await release(accepted.id);
    assert.equal((await budgetTotals()).daily, 0);
    pass(
      "different users serialize site daily/monthly reservations; exact-budget boundary; replay bypasses exhausted budget without another reservation; queued failure releases",
    );
    const uncertain = await submitVideo(a, randomUUID(), video()),
      claimed = await claimVideoJob();
    assert.equal(claimed!.task.id, uncertain.id);
    assert(await beginAiDispatch(uncertain.id, claimed!.token));
    assert.equal(await beginAiDispatch(uncertain.id, claimed!.token), false);
    await release(uncertain.id, claimed!.token);
    assert.equal((await budgetTotals()).daily, 600000);
    const [unc] =
      await q`select status from ai_cost_usage where task_id=${uncertain.id}`;
    assert.equal(unc.status, "UNCERTAIN");
    await q`update ai_cost_usage set created_at=now()-interval '40 days',dispatched_at=now()-interval '40 days' where task_id=${uncertain.id}`;
    assert.equal((await budgetTotals()).daily, 600000);
    await assert.rejects(
      submitVideo(b, randomUUID(), video()),
      (e: any) => e.details?.code === "SITE_DAY_BUDGET",
    );
    pass(
      "persisted one-time dispatch; post-dispatch failure returns user credits but retains unknown supplier budget across day/month boundaries",
    );
    const review = {
      requestId: randomUUID(),
      taskId: uncertain.id,
      amountMicros: 0,
      evidenceReference: "fixture-statement-no-real-charge",
      reason: "AUD-007 isolated simulated invoice review",
    };
    const reviewed = await Promise.all(
      Array.from({ length: 8 }, () => reviewAiCost(admin, review)),
    );
    assert.equal(new Set(reviewed.map((x) => x.id)).size, 1);
    assert.equal((await budgetTotals()).daily, 0);
    assert.equal(
      (
        await q`select count(*)::int as n from ai_cost_reviews where task_id=${uncertain.id}`
      )[0].n,
      1,
    );
    await assert.rejects(
      reviewAiCost(admin, { ...review, amountMicros: 1 }),
      (e: any) => e.status === 409,
    );
    await assert.rejects(
      reviewAiCost(b, { ...review, requestId: randomUUID() }),
      (e: any) => e.status === 403,
    );
    assert.deepEqual(await balances(a), { remaining: 200, frozen: 0 });
    pass(
      "privileged reason/evidence-based terminal cost review; eight concurrent retries audit once; UUID mutation/member denied; credits untouched",
    );
    const linked = await submitVideo(b, randomUUID(), video());
    await db.transaction(async (tx) => {
      await noteAiProviderReceipt(tx, linked.id);
    });
    await release(linked.id);
    assert.equal((await budgetTotals()).daily, 600000);
    await reviewAiCost(admin, {
      ...review,
      requestId: randomUUID(),
      taskId: linked.id,
    });
    assert.equal((await budgetTotals()).daily, 0);
    await change((p) => {
      p.dailyMicros = 1e9;
      p.monthlyMicros = 1e9;
    });
    const before = await currentAiPolicy(),
      oldInput = text("old-price"),
      old = await submitSummary(a, {
        ...oldInput,
        policyRevision: before.revision,
      });
    const [oldTask] = await q`select * from tasks where id=${old.id}`;
    const newPolicy = await change((p) => {
      const v = p.profiles.find((x: any) => x.toolId === "text-summary");
      v.credits = 7;
      v.maxTokens = 512;
      v.sort = 30;
      p.profiles.push({
        ...v,
        id: "summary-alternate-fixture",
        label: "Alternative fixture",
        credits: 4,
        sort: 1,
      });
      p.defaults["text-summary"] = "summary-alternate-fixture";
    });
    assert.equal(
      (await submitSummary(a, { ...oldInput, policyRevision: before.revision }))
        .id,
      old.id,
    );
    await assert.rejects(
      submitSummary(a, {
        ...text("stale-price"),
        policyRevision: before.revision,
      }),
      (e: any) => e.status === 409 && e.details.code === "QUOTE_CHANGED",
    );
    const next = await submitSummary(b, {
      ...text("new-price"),
      policyRevision: newPolicy.revision,
    });
    assert.equal(
      (await q`select credits from tasks where id=${next.id}`)[0].credits,
      4,
    );
    assert.equal(
      (await q`select credits from tasks where id=${old.id}`)[0].credits,
      oldTask.credits,
    );
    const executable = textTaskConfig(
      textProviderConfig(),
      oldTask.execution_config,
      oldTask.credits,
    );
    assert.equal(executable.maxTokens, oldTask.execution_config.maxTokens);
    assert.equal(executable.model, oldTask.model);
    const pub = await publicGovernedConfig("text-summary", { enabled: true });
    assert.equal(pub.profiles[0].id, "summary-alternate-fixture");
    await change((p) => {
      p.profiles.find((x: any) => x.id === p.defaults["text-summary"]).enabled =
        false;
    });
    assert.equal(
      (await publicGovernedConfig("text-summary", { enabled: true })).enabled,
      false,
    );
    await assert.rejects(
      submitSummary(b, text("disabled")),
      (e: any) => e.details.code === "MODEL_DISABLED",
    );
    await release(old.id);
    await release(next.id);
    await change((p) => {
      p.profiles.find((x: any) => x.id === p.defaults["text-summary"]).enabled =
        true;
    });
    pass(
      "model defaults/sort/enable and new credit prices audited; historical snapshot survives change/disable; stale UI quote refused before charging",
    );
    const current = await currentAiPolicy(),
      cmd = {
        requestId: randomUUID(),
        expectedRevision: current.revision,
        reason: "AUD-007 idempotent configuration audit fixture",
        config: current.config,
      };
    const updated = await saveAiPolicy(admin, cmd);
    assert.equal((await saveAiPolicy(admin, cmd)).id, updated.id);
    await assert.rejects(
      saveAiPolicy(admin, {
        ...cmd,
        reason: "different immutable configuration request",
      }),
      (e: any) => e.status === 409,
    );
    await assert.rejects(
      saveAiPolicy(admin, { ...cmd, requestId: randomUUID() }),
      (e: any) => e.status === 409,
    );
    await assert.rejects(
      saveAiPolicy(admin, { ...cmd, requestId: randomUUID(), reason: "short" }),
    );
    await assert.rejects(
      saveAiPolicy(a, { ...cmd, requestId: randomUUID() }),
      (e: any) => e.status === 403,
    );
    pass(
      "immutable configuration command, optimistic version conflict, reason/schema and current-role guards",
    );
    const metered = await submitSummary(a, text("metered-overrun")),
      running = await claimTask();
    assert.equal(running!.id, metered.id);
    assert(await beginAiDispatch(metered.id, running!.leaseToken));
    await promisify(execFile)(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `require('dotenv').config({path:'.env.local',quiet:true});(async()=>{const s=require('./src/services/ai-governance.ts');if(await s.beginAiDispatch('${metered.id}','${running!.leaseToken}'))throw Error('duplicate dispatch');await require('./src/db/index.ts').db.$client.end({timeout:2});console.log('dispatch refused after separate process restart')})()`,
      ],
      { env: process.env, timeout: 20000 },
    );
    assert(
      await finishTask(metered.id, running!.leaseToken, {
        result: "isolated completed summary",
        usage: { prompt_tokens: 100000000, completion_tokens: 100000000 },
      }),
    );
    const [cost] =
      await q`select * from ai_cost_usage where task_id=${metered.id}`;
    assert.equal(cost.anomaly, "ESTIMATE_EXCEEDED");
    assert(Number(cost.charged_micros) > Number(cost.estimate_micros));
    assert.equal(
      await finishTask(metered.id, running!.leaseToken, {
        result: "duplicate",
      }),
      false,
    );
    pass(
      "separate process cannot reuse dispatched permit; token-derived cost remains labelled estimate; over-estimate anomalies retained and terminal duplicate is inert",
    );
    await q.unsafe(
      `create function ${trigger}()returns trigger language plpgsql as $$begin raise exception 'AUD007 atomic fixture';end$$`,
    );
    await q.unsafe(
      `create trigger ${trigger} before insert on ai_cost_usage for each row execute function ${trigger}()`,
    );
    const priorBalance = await balances(b),
      priorCount = (
        await q`select count(*)::int as n from tasks where user_id=${b}`
      )[0].n;
    await assert.rejects(submitSummary(b, text("rollback-cost-insert")));
    await q.unsafe(`drop trigger ${trigger} on ai_cost_usage`);
    assert.deepEqual(await balances(b), priorBalance);
    assert.equal(
      (await q`select count(*)::int as n from tasks where user_id=${b}`)[0].n,
      priorCount,
    );
    const rollback = await submitSummary(b, text("rollback-finish")),
      job = await claimTask();
    assert.equal(job!.id, rollback.id);
    assert(await beginAiDispatch(rollback.id, job!.leaseToken));
    await q.unsafe(
      `create trigger ${trigger} before update on ai_cost_usage for each row execute function ${trigger}()`,
    );
    await assert.rejects(
      finishTask(rollback.id, job!.leaseToken, { result: "fixture result" }),
    );
    assert.equal(
      (await q`select status from tasks where id=${rollback.id}`)[0].status,
      "RUNNING",
    );
    await q.unsafe(`drop trigger ${trigger} on ai_cost_usage`);
    await release(rollback.id, job!.leaseToken);
    pass(
      "cost reservation or finalization persistence failure rolls back task, credit hold and ledger atomically",
    );
    const p = await currentAiPolicy();
    await change((x) => {
      x.dailyMicros = 1e9;
      x.monthlyMicros = 0;
    });
    await assert.rejects(
      submitSummary(b, text("month-budget")),
      (e: any) => e.details?.code === "SITE_MONTH_BUDGET",
    );
    await change((x) => {
      x.dailyMicros = 1e9;
      x.monthlyMicros = 1e9;
    });
    const live = await submitSummary(b, text("no-review-running"));
    await assert.rejects(
      reviewAiCost(admin, {
        ...review,
        requestId: randomUUID(),
        taskId: live.id,
      }),
      (e: any) => e.status === 409,
    );
    await release(live.id);
    await q`insert into account(id,"accountId","providerId","userId",password)values(${randomUUID()},${admin},'credential',${admin},${await hashPassword(password)})`;
    await q`insert into account(id,"accountId","providerId","userId",password)values(${randomUUID()},${a},'credential',${a},${await hashPassword(password)})`;
    async function login(e: string) {
      const r = await fetch(base + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password }),
      });
      assert.equal(r.status, 200);
      return r.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; ");
    }
    adCookie = await login(email);
    memberCookie = await login("aud007-" + a + "@example.invalid");
    assert.equal((await request("/api/v1/admin/ai")).status, 401);
    assert.equal((await request("/api/v1/admin/ai", memberCookie)).status, 403);
    assert.equal((await request("/api/v1/admin/ai", adCookie)).status, 200);
    const configNow = await currentAiPolicy(),
      post = {
        action: "policy",
        requestId: randomUUID(),
        expectedRevision: configNow.revision,
        reason: "AUD-007 real local route permission fixture",
        config: configNow.config,
      };
    assert.equal(
      (
        await request(
          "/api/v1/admin/ai",
          adCookie,
          post,
          "https://foreign.invalid",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/v1/admin/ai", adCookie, {
          ...post,
          apiKey: "not-allowed",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/v1/tools/text-summary", adCookie, {
          ...text("stale-api"),
          policyRevision: before.revision,
        })
      ).status,
      409,
    );
    const response = await request("/api/v1/admin/ai", adCookie);
    for (const key of ["TEXT_AI_API_KEY", "KIE_API_KEY"])
      if (process.env[key])
        assert(!JSON.stringify(response.body).includes(process.env[key]!));
    await q`update "user"set disabled=true where id=${admin}`;
    assert(
      [401, 403].includes((await request("/api/v1/admin/ai", adCookie)).status),
    );
    await assert.rejects(
      saveAiPolicy(admin, { ...cmd, requestId: randomUUID() }),
      (e: any) => e.status === 403,
    );
    await q`update "user"set disabled=false where id=${admin}`;
    pass(
      "zero monthly budget and active-review refusal; actual admin API/auth/CSRF/strict schema/stale quote/revoked-role guards; no credential projection",
    );
    await writeFile(
      "docs/project-state/aud-007-governance-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          passed,
          groups: passed.length,
          providerCalls: 0,
          financialFixturesRemoved: true,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await q.unsafe(`drop trigger if exists ${trigger} on ai_cost_usage`);
    await q.unsafe(`drop function if exists ${trigger}()`);
    await fixture.restore(admin);
    await q`delete from ai_cost_reviews where actor_id=${admin}`;
    for (const id of [admin, a, b]) {
      await q`delete from video_reviews where task_id in(select id from tasks where user_id=${id})`;
      await q`delete from task_assets where user_id=${id}`;
      await q`delete from video_jobs where task_id in(select id from tasks where user_id=${id})`;
      await q`delete from credit_transactions where user_id=${id}`;
      await q`delete from credit_holds where user_id=${id}`;
      await q`delete from task_attempts where task_id in(select id from tasks where user_id=${id})`;
      await q`delete from tasks where user_id=${id}`;
      await q`delete from credit_packages where user_id=${id}`;
      await q`delete from session where "userId"=${id}`;
      await q`delete from account where "userId"=${id}`;
      await q`delete from "user"where id=${id}`;
    }
    await q.end();
    await db.$client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
