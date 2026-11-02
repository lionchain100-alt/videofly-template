import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile, unlink, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/laconic_local")
  throw Error("Dedicated local database only.");
try {
  const id = Number(
    (await readFile(new URL("../.local/video-worker.pid", import.meta.url), "utf8")).trim(),
  );
  let alive = false;
  try {
    process.kill(id, 0);
    alive = true;
  } catch {}
  if (alive) throw Error("Stop video worker before running isolated fixtures.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const sql = postgres(url.toString(), {
  ssl: false,
  max: 3,
  connection: { TimeZone: "UTC" },
  onnotice: () => {},
});
const uid = randomUUID();
const createdIds = [];
const fixtureKey = `fixture-${randomUUID()}`;
const jobs = new Map();
const errors = [];
const media = await readFile(new URL("./fixtures/blue-1s.mp4", import.meta.url));
let submits = 0;
let downloads = 0;
let base = "";
const trigger = `qa_video_${randomUUID().slice(0, 8)}`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/redirect-private") {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
      res.end();
      return;
    }
    if (req.url.startsWith("/media/")) {
      downloads++;
      const id = req.url.split("/").pop();
      const job = jobs.get(id);
      if (job?.prompt.includes("RETRY_STORAGE") && !job.storageFailed) {
        job.storageFailed = true;
        res.writeHead(500);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": media.length });
      res.end(media);
      return;
    }
    assert.equal(req.headers.authorization, `Bearer ${fixtureKey}`);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      submits++;
      assert.equal(req.url, "/api/v1/jobs/createTask");
      let content = "";
      for await (const b of req) content += b;
      const data = JSON.parse(content);
      assert.equal(data.model, "wan/2-7-text-to-video");
      assert.equal(data.callBackUrl, undefined);
      assert.equal(data.input.duration, 5);
      assert.equal(data.input.resolution, "1080p");
      assert.equal(data.input.ratio, "16:9");
      if (data.input.prompt.includes("REJECT_CREATE")) {
        res.end(JSON.stringify({ code: 401, msg: fixtureKey }));
        return;
      }
      const id = `kie-fixture-${randomUUID()}`;
      jobs.set(id, { prompt: data.input.prompt, polls: 0 });
      if (data.input.prompt.includes("DROP_RESPONSE")) {
        req.socket.destroy();
        return;
      }
      res.end(JSON.stringify({ code: 200, data: { taskId: id } }));
      return;
    }
    const id = new URL(req.url, base).searchParams.get("taskId");
    const job = jobs.get(id);
    assert(job);
    job.polls++;
    if (job.prompt.includes("RETRY_QUERY") && job.polls === 1) {
      res.end(JSON.stringify({ code: 429, msg: "Retry fixture" }));
      return;
    }
    const state = job.prompt.includes("FAIL_GENERATION")
      ? "fail"
      : job.polls < 3
        ? "generating"
        : "success";
    res.end(
      JSON.stringify({
        code: 200,
        data: {
          taskId: id,
          model: "wan/2-7-text-to-video",
          state,
          param: JSON.stringify({ input: JSON.stringify({ prompt: job.prompt }) }),
          resultJson: JSON.stringify({ resultUrls: [`${base}/media/${id}`] }),
        },
      }),
    );
  } catch (e) {
    errors.push(e.message);
    res.writeHead(500);
    res.end("{}");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
base = `http://127.0.0.1:${server.address().port}`;
Object.assign(process.env, {
  VIDEO_AI_ENABLED: "true",
  VIDEO_AI_PROVIDER: "kie",
  VIDEO_AI_BASE_URL: base,
  VIDEO_AI_MODEL: "wan/2-7-text-to-video",
  VIDEO_GENERATION_CREDITS: "10",
  KIE_API_KEY: fixtureKey,
  VIDEO_ALLOW_LOCAL_TEST: "true",
});
const { submitVideo, claimVideoJob, processVideoJob, getVideoTask } = await import(
  "../src/services/video-jobs.ts"
);
const { reviewVideo } = await import("../src/services/video-review.ts");
const { claimTask, finishTask, listSummaryTasks } = await import("../src/services/tasks.ts");
const { assetPath, safeVideoResponse, publicAddress } = await import(
  "../src/services/video-assets.ts"
);
const { db } = await import("../src/db/index.ts");
const {aiPolicyFixture}=await import('./ai-policy-fixture.ts');const policyFixture=await aiPolicyFixture(sql);
async function balance() {
  return (
    await sql`select coalesce(sum(remaining_credits),0)::int as available,coalesce(sum(frozen_credits),0)::int as frozen from credit_packages where user_id=${uid} and status='ACTIVE' and(expired_at is null or expired_at>now() at time zone 'UTC')`
  )[0];
}
async function create(marker) {
  const input = {
    prompt: `${marker} A blue paper boat moves slowly through gentle ripples, fixed camera and no text.`,
    aspectRatio: "16:9",
  };
  const requestId = randomUUID();
  const value = await submitVideo(uid, requestId, input);
  createdIds.push(value.id);
  return { ...value, input, requestId };
}
async function step() {
  await sql`update video_jobs set next_run_at=now()-interval '1 second' where task_id in(select id from tasks where user_id=${uid})`;
  const job = await claimVideoJob();
  assert(job, "Expected runnable fixture");
  assert.equal(job.task.userId, uid);
  await processVideoJob(job);
  return job;
}
async function drain(id) {
  for (let i = 0; i < 12; i++) {
    const task = await getVideoTask(uid, id);
    if (["SUCCEEDED", "FAILED"].includes(task.status) || task.stage === "RECONCILING") return task;
    await step();
  }
  throw Error("Fixture did not finish");
}
try {
  assert.equal(
    (await sql`select count(*)::int as n from tasks where status in('QUEUED','RUNNING')`)[0].n,
    0,
  );
  await sql`insert into "user"(id,name,email,"emailVerified","isAdmin")values(${uid},'视频协议临时测试',${`qa-video-${uid}@laconic.local`},true,false)`;
  await sql`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status)values(${uid},100,100,0,'SYSTEM_ADJUST','ACTIVE')`;
  const [admin] = await sql`select id from "user" where email=${process.env.LOCAL_ADMIN_EMAIL}`;
  const item = await create("RETRY_QUERY RETRY_STORAGE");
  const replay = await Promise.all(
    Array.from({ length: 8 }, () => submitVideo(uid, item.requestId, item.input)),
  );
  assert(replay.every((x) => x.id === item.id));
  assert.deepEqual(await balance(), { available: 90, frozen: 10 });
  assert.equal(submits, 0);
  assert.equal(await claimTask(), null);
  assert.equal((await listSummaryTasks(uid)).length, 0);
  await assert.rejects(() =>
    submitVideo(uid, item.requestId, { ...item.input, prompt: item.input.prompt + " changed" }),
  );
  const completed = await drain(item.id);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.creditStatus, "SETTLED");
  assert.deepEqual(await balance(), { available: 90, frozen: 0 });
  assert.equal(submits, 1);
  assert.equal(downloads, 2);
  assert.equal(
    (await sql`select count(*)::int as n from task_assets where task_id=${item.id}`)[0].n,
    1,
  );
  const phases =
    await sql`select trans_type,credits from credit_transactions where task_id=${item.id} order by id`;
  assert.deepEqual(
    phases.map((x) => [x.trans_type, x.credits]),
    [
      ["TASK_HOLD", -10],
      ["TASK_SETTLE", 0],
    ],
  );
  const [terminal] = await sql`select lease_token from tasks where id=${item.id}`;
  assert.equal(await finishTask(item.id, terminal.lease_token, { result: "duplicate" }), false);
  console.log(
    "PASS one submission/hold/settlement under replay; transient query errors and storage retries never regenerate; text worker isolated",
  );
  for (const marker of ["REJECT_CREATE", "FAIL_GENERATION"]) {
    const before = await balance();
    const v = await create(marker);
    assert.equal((await drain(v.id)).status, "FAILED");
    assert.deepEqual(await balance(), before);
  }
  console.log(
    "PASS definite create rejection and confirmed generation failure release credits exactly once",
  );
  const uncertain = await create("DROP_RESPONSE");
  const beforePost = submits;
  assert.equal((await drain(uncertain.id)).stage, "RECONCILING");
  assert.equal(submits, beforePost + 1);
  assert.equal(await claimVideoJob(), null);
  assert.deepEqual(await balance(), { available: 80, frozen: 10 });
  const [externalId] = [...jobs.entries()].find(([, v]) => v.prompt === uncertain.input.prompt);
  const review = {
    requestId: randomUUID(),
    taskId: uncertain.id,
    action: "LINK_TASK",
    reason: "隔离测试核实相同模型与提示词，恢复已有供应商任务",
    providerTaskId: externalId,
  };
  assert.equal((await reviewVideo(admin.id, review)).replayed, false);
  assert.equal((await reviewVideo(admin.id, review)).replayed, true);
  assert.equal((await drain(uncertain.id)).status, "SUCCEEDED");
  assert.equal(submits, beforePost + 1);
  assert.deepEqual(await balance(), { available: 80, frozen: 0 });
  console.log(
    "PASS lost create response stays frozen for review; verified provider receipt resumes without a second paid submission",
  );
  const crashed = await create("CRASH_BEFORE_CALL");
  const claim = await claimVideoJob();
  assert.equal(claim.task.id, crashed.id);
  await sql`update video_jobs set lease_until=now()-interval '1 second' where task_id=${crashed.id}`;
  const beforeCrash = submits;
  await step();
  assert.equal((await getVideoTask(uid, crashed.id)).stage, "RECONCILING");
  assert.equal(submits, beforeCrash);
  const release = {
    requestId: randomUUID(),
    taskId: crashed.id,
    action: "CONFIRM_FAILURE",
    reason: "隔离测试确认执行进程在调用前退出，未向供应商提交",
    acknowledgeNoResult: true,
  };
  await reviewVideo(admin.id, release);
  await reviewVideo(admin.id, release);
  assert.deepEqual(await balance(), { available: 80, frozen: 0 });
  console.log(
    "PASS interrupted submitting lease never resubmits; audited operator release is idempotent",
  );
  const rollback = await create("ROLLBACK_STORAGE");
  await step();
  await step();
  await step();
  await step();
  assert.equal((await getVideoTask(uid, rollback.id)).stage, "STORING");
  await sql.unsafe(
    `create function ${trigger}() returns trigger language plpgsql as $$ begin if NEW.user_id='${uid}' and NEW.trans_type='TASK_SETTLE' then raise exception 'Isolated video settlement fault'; end if; return NEW; end $$`,
  );
  await sql.unsafe(
    `create trigger ${trigger} before insert on credit_transactions for each row execute function ${trigger}()`,
  );
  await step();
  assert.equal((await getVideoTask(uid, rollback.id)).status, "RUNNING");
  assert.equal(
    (await sql`select count(*)::int as n from task_assets where task_id=${rollback.id}`)[0].n,
    0,
  );
  assert.deepEqual(await balance(), { available: 70, frozen: 10 });
  await access(assetPath(rollback.id));
  const beforeDownloads = downloads;
  const beforeSubmit = submits;
  await sql`update video_jobs set storage_attempts=4 where task_id=${rollback.id}`;
  await step();
  assert.equal((await getVideoTask(uid,rollback.id)).stage,"RECONCILING");
  await assert.rejects(()=>reviewVideo(admin.id,{requestId:randomUUID(),taskId:rollback.id,action:"CONFIRM_FAILURE",reason:"测试已有成功结果时禁止直接释放冻结积分",acknowledgeNoResult:true}));
  await reviewVideo(admin.id,{requestId:randomUUID(),taskId:rollback.id,action:"RETRY_STORAGE",reason:"测试已成功文件只恢复保存与结算，不重新调用模型"});
  await sql.unsafe(`drop trigger ${trigger} on credit_transactions`);
  await sql.unsafe(`drop function ${trigger}()`);
  assert.equal((await drain(rollback.id)).status, "SUCCEEDED");
  assert.equal(downloads, beforeDownloads);
  assert.equal(submits, beforeSubmit);
  assert.deepEqual(await balance(), { available: 70, frozen: 0 });
  console.log(
    "PASS settlement fault rolls back asset/task/hold/ledger; persisted MP4 is reused without model call or re-download",
  );
  const queued = await create("QUEUE_TIMEOUT");
  await sql`update tasks set queue_deadline=now()-interval '1 second' where id=${queued.id}`;
  const beforeQueue = submits;
  assert.equal((await drain(queued.id)).status, "FAILED");
  assert.equal(submits, beforeQueue);
  assert.deepEqual(await balance(), { available: 70, frozen: 0 });
  const expired = await create("FAIL_GENERATION EXPIRED");
  await sql`update credit_packages set expired_at=now() at time zone 'UTC'-interval '1 second' where user_id=${uid}`;
  assert.equal((await drain(expired.id)).status, "FAILED");
  assert.deepEqual(await balance(), { available: 0, frozen: 0 });
  console.log(
    "PASS queued timeout releases without submission; expired source credits are not revived",
  );
  await sql`insert into credit_packages(user_id,initial_credits,remaining_credits,frozen_credits,trans_type,status)values(${uid},10,10,0,'SYSTEM_ADJUST','ACTIVE')`;
  const raceInput={prompt:"REJECT_CREATE Concurrent fixture verifies only one reservation fits the balance",aspectRatio:"16:9"};
  const races=await Promise.allSettled([submitVideo(uid,randomUUID(),raceInput),submitVideo(uid,randomUUID(),raceInput)]);
  const accepted=races.filter(v=>v.status==="fulfilled");assert.equal(accepted.length,1);
  const raceId=accepted[0].value.id;createdIds.push(raceId);assert.deepEqual(await balance(),{available:0,frozen:10});
  assert.equal((await drain(raceId)).status,"FAILED");assert.deepEqual(await balance(),{available:10,frozen:0});
  console.log("PASS competing video submissions cannot overspend a one-task balance");
  for (const address of [
    "127.0.0.1",
    "10.0.0.2",
    "169.254.169.254",
    "192.168.1.3",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(() => safeVideoResponse(`${base}/redirect-private`));
  process.env.VIDEO_ALLOW_LOCAL_TEST = "false";
  await assert.rejects(() => safeVideoResponse(`${base}/media/x`));
  assert.deepEqual(errors, []);
  console.log(
    "PASS private source addresses, private redirects and untrusted HTTP are rejected before connection",
  );
  console.log("Video fixture tests passed; no real provider requests made.");
} finally {
  await sql.unsafe(`drop trigger if exists ${trigger} on credit_transactions`);
  await sql.unsafe(`drop function if exists ${trigger}()`);
  await sql.begin(async (tx) => {
    await tx`delete from video_reviews where task_id in(select id from tasks where user_id=${uid})`;
    await tx`delete from task_assets where user_id=${uid}`;
    await tx`delete from video_jobs where task_id in(select id from tasks where user_id=${uid})`;
    await tx`delete from credit_transactions where user_id=${uid}`;
    await tx`delete from credit_holds where user_id=${uid}`;
    await tx`delete from task_attempts where task_id in(select id from tasks where user_id=${uid})`;
    await tx`delete from tasks where user_id=${uid}`;
    await tx`delete from credit_packages where user_id=${uid}`;
    await tx`delete from "user" where id=${uid}`;
  });
  for (const id of createdIds) await unlink(assetPath(id)).catch(() => {});
  await policyFixture.restore();
  await sql.end();
  await db.$client.end({ timeout: 3 });
  await new Promise((r) => server.close(r));
  console.log("Temporary video fixtures removed.");
}
