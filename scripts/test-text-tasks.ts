import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/laconic_local")
    throw Error("Dedicated local database only");
  let managedPid: number | null = null;
  try {
    managedPid = Number(
      (await readFile(new URL("../.local/text-worker.pid", import.meta.url), "utf8")).trim(),
    );
  } catch {}
  let workerAlive = false;
  if (managedPid && managedPid !== process.pid) {
    try {
      process.kill(managedPid, 0);
      workerAlive = true;
    } catch {}
  }
  if (workerAlive)
    throw Error(
      "Stop the managed text worker before running isolated tests (start-text-worker.ps1 -Stop).",
    );
  const sql = postgres(url.toString(), {
    ssl: false,
    max: 3,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  const uid = randomUUID();
  const other = randomUUID();
  const run = randomUUID().slice(0, 8);
  const trigger = `qa_text_${run}`;
  let calls = 0;
  let expectDeepSeek = false;
  const secret = `fixture-key-${randomUUID()}`;
  const provider = createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.headers.authorization, `Bearer ${secret}`);
    let data = "";
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data);
    const text = body.messages[1].content;
    assert.equal(body.model, expectDeepSeek ? "deepseek-flash" : "fixture-summary");
    if (expectDeepSeek) assert.deepEqual(body.thinking, { type: "disabled" });
    else assert.equal(body.thinking, undefined);
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 2048);
    if (text.includes("FAIL_AUTH")) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { message: secret } }));
      return;
    }
    if (text.includes("EMPTY_RESPONSE")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "" } }] }));
      return;
    }
    if (text.includes("TIMEOUT")) {
      setTimeout(() => {
        if (!res.destroyed) res.end("{}");
      }, 1500);
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "fixture-completion",
        choices: [
          {
            finish_reason: "stop",
            message: { content: "测试摘要：持久化任务成功，积分只结算一次。" },
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
      }),
    );
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const port = (provider.address() as { port: number }).port;
  Object.assign(process.env, {
    TEXT_AI_ENABLED: "true",
    TEXT_AI_PROVIDER: "openai-compatible",
    TEXT_AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    TEXT_AI_MODEL: "fixture-summary",
    TEXT_AI_API_KEY: secret,
    TEXT_AI_ALLOW_LOCAL_TEST: "true",
    TEXT_AI_TOKEN_FIELD: "max_tokens",
    TEXT_AI_MAX_OUTPUT_TOKENS: "2048",
    TEXT_AI_TIMEOUT_MS: "1000",
    TEXT_SUMMARY_CREDITS: "3",
  });
  const { submitSummary, getSummaryTask, claimTask, finishTask, recoverExpiredTasks } =
    await import("../src/services/tasks");
  const { executeSummary, textProviderConfig } = await import("../src/ai/text-provider");
  const { summaryInputSchema } = await import("../src/tools/text-summary/contract");
  const { db } = await import("../src/db");
  const runWorker = () =>
    promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/task-worker.ts", "--once"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: process.env,
      timeout: 20000,
    });
  const submission = (marker = "NORMAL") => ({
    requestId: randomUUID(),
    input: {
      text: `${marker} 文本摘要集成测试，仅为隔离的协议夹具，不调用真实模型，也不代表真实 AI 验收。`,
      length: "short" as const,
      language: "zh" as const,
    },
  });
  async function balance() {
    return (
      await sql`select coalesce(sum(remaining_credits),0)::int as available,coalesce(sum(frozen_credits),0)::int as frozen from credit_packages where user_id=${uid} and status='ACTIVE' and (expired_at is null or expired_at>now())`
    )[0];
  }
  try {
    expectDeepSeek = true;
    const deepSeekResult = await executeSummary(submission().input, {
      ...textProviderConfig(), provider: "deepseek", model: "deepseek-flash",
    });
    assert(deepSeekResult.text.includes("测试摘要"));
    expectDeepSeek = false;
    calls = 0;
    console.log("PASS DeepSeek request contract: flash model, non-thinking mode and complete text response");
    assert.equal(
      (await sql`select count(*)::int as n from tasks where status in ('QUEUED','RUNNING')`)[0].n,
      0,
      "Stop active tasks before this isolated test",
    );
    for (const id of [uid, other])
      await sql`insert into "user"(id,name,email,"emailVerified","isAdmin") values(${id},'文本任务临时验收',${`qa-text-${run}-${id}@laconic.local`},true,false)`;
    await sql`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status,expired_at)values(${uid},30,30,0,'SYSTEM_ADJUST','ACTIVE',${new Date(Date.now() + 86400000).toISOString()}::timestamp)`;
    const input = submission();
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => submitSummary(uid, input)),
    );
    assert.equal(new Set(duplicates.map((x) => x.id)).size, 1);
    assert.deepEqual(await balance(), { available: 27, frozen: 3 });
    assert.equal(calls, 0);
    await assert.rejects(() =>
      submitSummary(uid, { ...input, input: { ...input.input, text: input.input.text + "改动" } }),
    );
    assert.equal(await getSummaryTask(other, duplicates[0].id), null);
    const job = await claimTask();
    assert.equal(job!.id, duplicates[0].id);
    const output = await executeSummary(summaryInputSchema.parse(job!.input), textProviderConfig());
    const success = {
      result: output.text,
      providerRequestId: output.providerRequestId,
      usage: output.usage,
    };
    assert.equal(await finishTask(job!.id, job!.leaseToken, success), true);
    assert.equal(await finishTask(job!.id, job!.leaseToken, success), false);
    assert.deepEqual(await balance(), { available: 27, frozen: 0 });
    assert.equal(calls, 1);
    console.log("PASS concurrent replay: one task/hold/call/settlement; cross-user reads denied");
    for (const marker of ["FAIL_AUTH", "EMPTY_RESPONSE", "TIMEOUT"]) {
      const created = await submitSummary(uid, submission(marker));
      await runWorker();
      const task = await getSummaryTask(uid, created.id);
      assert.equal(task?.status, "FAILED");
      assert.equal(task?.creditStatus, "RELEASED");
      assert(!JSON.stringify(task).includes(secret));
      assert.deepEqual(await balance(), { available: 27, frozen: 0 });
    }
    console.log(
      "PASS protocol errors, empty results and timeouts release once without leaking provider credentials",
    );
    const queued = await submitSummary(uid, submission());
    await runWorker();
    assert.equal((await getSummaryTask(uid, queued.id))?.status, "SUCCEEDED");
    assert.deepEqual(await balance(), { available: 24, frozen: 0 });
    console.log("PASS separately launched worker resumes a persisted queued task");
    const rollback = await submitSummary(uid, submission());
    const rollbackJob = await claimTask();
    assert.equal(rollbackJob!.id, rollback.id);
    await sql.unsafe(
      `create function ${trigger}() returns trigger language plpgsql as $$ begin if NEW.user_id='${uid}' and NEW.trans_type='TASK_SETTLE' then raise exception 'Isolated task rollback fixture'; end if; return NEW; end $$`,
    );
    await sql.unsafe(
      `create trigger ${trigger} before insert on credit_transactions for each row execute function ${trigger}()`,
    );
    await assert.rejects(() =>
      finishTask(rollback.id, rollbackJob!.leaseToken, { result: "Fixture completed output" }),
    );
    assert.equal((await getSummaryTask(uid, rollback.id))?.status, "RUNNING");
    assert.deepEqual(await balance(), { available: 21, frozen: 3 });
    assert.equal(
      (
        await sql`select count(*)::int as n from credit_transactions where task_id=${rollback.id} and trans_type='TASK_SETTLE'`
      )[0].n,
      0,
    );
    await sql.unsafe(`drop trigger ${trigger} on credit_transactions`);
    await sql.unsafe(`drop function ${trigger}()`);
    const callSnapshot = calls;
    await finishTask(rollback.id, rollbackJob!.leaseToken, { result: "Fixture completed output" });
    assert.equal(calls, callSnapshot);
    assert.deepEqual(await balance(), { available: 21, frozen: 0 });
    console.log(
      "PASS settlement persistence failure rolls back task, hold and ledger; persistence retry never re-calls provider",
    );
    const queueTimeout = await submitSummary(uid, submission());
    await sql`update tasks set queue_deadline=now()-interval '1 second' where id=${queueTimeout.id}`;
    await recoverExpiredTasks();
    assert.equal((await getSummaryTask(uid, queueTimeout.id))?.errorCode, "QUEUE_TIMEOUT");
    assert.deepEqual(await balance(), { available: 21, frozen: 0 });
    const stale = await submitSummary(uid, submission());
    const crashed = await claimTask();
    assert.equal(stale.id, crashed!.id);
    await sql`update tasks set lease_until=now()-interval '1 second' where id=${stale.id}`;
    const beforeCalls = calls;
    await Promise.all([recoverExpiredTasks(), recoverExpiredTasks()]);
    assert.equal((await getSummaryTask(uid, stale.id))?.status, "FAILED");
    assert.equal(calls, beforeCalls);
    assert.deepEqual(await balance(), { available: 21, frozen: 0 });
    console.log(
      "PASS interrupted worker lease recovers with one release and no automatic paid retry",
    );
    const expired = await submitSummary(uid, submission());
    const expJob = await claimTask();
    assert.equal(expJob!.id, expired.id);
    await sql`update credit_packages set expired_at=now()-interval '1 second' where user_id=${uid}`;
    await finishTask(expired.id, expJob!.leaseToken, {
      errorCode: "TEST",
      errorMessage: "Fixture failure",
    });
    assert.deepEqual(await balance(), { available: 0, frozen: 0 });
    assert.equal(
      (
        await sql`select frozen_credits,remaining_credits from credit_packages where user_id=${uid}`
      )[0].frozen_credits,
      0,
    );
    const ledger =
      await sql`select credits from credit_transactions where task_id=${expired.id} and trans_type='TASK_RELEASE'`;
    assert.equal(ledger[0].credits, 0);
    console.log("PASS expired original packages are released without reviving expired balance");
    await assert.rejects(
      () => submitSummary(uid, submission()),
      (e: unknown) => (e as { status: number }).status === 402,
    );
    await sql`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status) values(${uid},3,3,0,'SYSTEM_ADJUST','ACTIVE')`;
    const races = await Promise.allSettled([
      submitSummary(uid, submission()),
      submitSummary(uid, submission()),
    ]);
    assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
    assert.deepEqual(await balance(), { available: 0, frozen: 3 });
    const final = await claimTask();
    await finishTask(final!.id, final!.leaseToken, {
      errorCode: "TEST",
      errorMessage: "Fixture release",
    });
    const receipt = submission();
    process.env.TEXT_AI_ENABLED = "false";
    const countBefore = (await sql`select count(*)::int as n from tasks where user_id=${uid}`)[0].n;
    await assert.rejects(() => submitSummary(uid, receipt));
    assert.equal(
      (await sql`select count(*)::int as n from tasks where user_id=${uid}`)[0].n,
      countBefore,
    );
    console.log(
      "PASS competing submissions cannot overspend; disabled configuration creates no task/charge",
    );
    const leak =
      await sql`select count(*)::int as n from tasks where user_id=${uid} and execution_config::text like ${`%${secret}%`}`;
    assert.equal(leak[0].n, 0);
    console.log("All text-task fixture tests passed. Real provider verification remains separate.");
  } finally {
    await sql.unsafe(`drop trigger if exists ${trigger} on credit_transactions`);
    await sql.unsafe(`drop function if exists ${trigger}()`);
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;
      await tx`delete from credit_transactions where user_id in (${uid},${other})`;
      await tx`delete from credit_holds where user_id in (${uid},${other})`;
      await tx`delete from task_attempts where task_id in(select id from tasks where user_id in (${uid},${other}))`;
      await tx`delete from tasks where user_id in (${uid},${other})`;
      await tx`delete from credit_packages where user_id in (${uid},${other})`;
      await tx`delete from "user" where id in (${uid},${other})`;
    });
    await sql.end();
    await db.$client.end({ timeout: 5 });
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    console.log("Temporary task fixtures removed.");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
