import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, unlink, rename } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "dotenv";
import postgres from "postgres";
const root = fileURLToPath(new URL("../", import.meta.url));
const peer = process.argv[2] || "aurora-notes";
if (!/^[a-z][a-z0-9-]{2,30}$/.test(peer)) throw Error("Invalid peer site ID");
const roots = [root, path.resolve(root, "../sites", peer)];
const passed = [];
const pass = (m) => {
  passed.push(m);
  console.log(`PASS ${m}`);
};
async function siteAt(root) {
  const raw = await readFile(path.join(root, "src/config/site.json"), "utf8");
  const site = JSON.parse(raw);
  const env = parse(await readFile(path.join(root, ".env.local"), "utf8"));
  assert.equal(site.origin, env.NEXT_PUBLIC_APP_URL);
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, String(site.local.databasePort));
  return {
    root,
    raw,
    site,
    env,
    db: postgres(env.DATABASE_URL, { ssl: false, max: 2 }),
    cookie: "",
  };
}
const [a, b] = await Promise.all(roots.map(siteAt));
async function request(s, route, body, { method, headers, cookie } = {}) {
  const response = await fetch(s.site.origin + route, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Origin: s.site.origin,
      Cookie: cookie ?? s.cookie,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(120000),
  });
  if (cookie === undefined) {
    const jar = new Map(
      s.cookie
        .split("; ")
        .filter(Boolean)
        .map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i), x.slice(i + 1)];
        }),
    );
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(";")[0];
      const i = first.indexOf("=");
      jar.set(first.slice(0, i), first.slice(i + 1));
    }
    s.cookie = Array.from(jar, ([k, v]) => `${k}=${v}`).join("; ");
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: response.status, data, text };
}
async function snapshot(s) {
  return (
    await s.db`select (select count(*)::int from tasks) as tasks,(select count(*)::int from payment_orders) as orders,(select count(*)::int from credit_transactions) as ledger,(select coalesce(sum(remaining_credits),0)::int from credit_packages) as remaining,(select coalesce(sum(frozen_credits),0)::int from credit_packages) as frozen`
  )[0];
}
async function writeManifest(s, value) {
  const target = path.join(s.root, "src/config/site.json");
  const temp = target + ".test.tmp";
  await writeFile(
    temp,
    typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
  );
  await rename(temp, target);
}
const uid = randomUUID();
const taskId = randomUUID();
const files = [];
const before = await Promise.all([a, b].map(snapshot));
try {
  assert.notEqual(a.env.BETTER_AUTH_SECRET, b.env.BETTER_AUTH_SECRET);
  for (const k of [
    "DATABASE_URL",
    "LOCAL_DATABASE_PASSWORD",
    "LOCAL_POSTGRES_ADMIN_PASSWORD",
    "LOCAL_ADMIN_PASSWORD",
  ])
    assert.notEqual(a.env[k], b.env[k]);
  assert.notEqual(a.site.isolation.cookiePrefix, b.site.isolation.cookiePrefix);
  assert.notEqual(
    a.site.isolation.fileNamespace,
    b.site.isolation.fileNamespace,
  );
  for (const k of Object.keys(b.env).filter((k) =>
    /(API_KEY|CLIENT_SECRET|WEBHOOK_SECRET|SECRET_KEY|ACCESS_KEY)/.test(k),
  ))
    assert(
      ["GOOGLE_CLIENT_SECRET", "RESEND_API_KEY"].includes(k) || !b.env[k],
      `Unexpected copied provider credential ${k}`,
    );
  for (const [own, other] of [
    [a, b],
    [b, a],
  ]) {
    const foreign = new URL(own.env.DATABASE_URL);
    foreign.port = String(other.site.local.databasePort);
    const db = postgres(foreign.href, {
      ssl: false,
      max: 1,
      connect_timeout: 2,
    });
    let denied = false;
    try {
      await db`select 1`;
    } catch {
      denied = true;
    } finally {
      await db.end({ timeout: 1 });
    }
    assert(denied, "Cross-cluster credentials must fail");
  }
  pass(
    "distinct databases, roles, passwords, auth secrets, provider key configuration and file namespaces; cross-cluster credentials rejected",
  );
  for (const s of [a, b]) {
    assert.equal(
      (
        await request(s, "/api/auth/sign-in/email", {
          email: s.env.LOCAL_ADMIN_EMAIL,
          password: s.env.LOCAL_ADMIN_PASSWORD,
        })
      ).status,
      200,
      "Admin login",
    );
    assert.equal((await request(s, "/api/v1/credit/balance")).status, 200);
  }
  before[1] = await snapshot(b); // The first-ever local login may receive the existing daily 2-credit bonus.
  const cookieA = a.cookie;
  const cookieB = b.cookie;
  assert.equal(
    (await request(b, "/api/v1/credit/balance", undefined, { cookie: cookieA }))
      .status,
    401,
  );
  assert.equal(
    (await request(a, "/api/v1/credit/balance", undefined, { cookie: cookieB }))
      .status,
    401,
  );
  assert.equal(
    (
      await request(b, "/api/v1/credit/balance", undefined, {
        cookie: cookieA.replaceAll(
          a.site.isolation.cookiePrefix,
          b.site.isolation.cookiePrefix,
        ),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(a, "/api/v1/credit/balance", undefined, {
        cookie: `${cookieA}; ${cookieB}`,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(b, "/api/v1/credit/balance", undefined, {
        cookie: `${cookieA}; ${cookieB}`,
      })
    ).status,
    200,
  );
  pass(
    "both admins log in simultaneously; foreign and renamed foreign session cookies cannot authenticate",
  );
  for (const s of [a, b])
    await s.db`insert into "user" (id,name,email,"emailVerified","isAdmin") values (${uid},'AUD003 isolated fixture',${`aud003-${uid}@${s.site.id}.local`},true,false)`;
  const grant = {
    requestId: randomUUID(),
    userId: uid,
    credits: 13,
    expiryDays: 30,
    remark: "AUD003 第二站隔离验收临时积分",
  };
  assert.equal(
    (await request(b, "/api/v1/admin/credits/add", grant)).status,
    200,
  );
  assert.equal(
    (await request(b, "/api/v1/admin/credits/add", grant)).status,
    200,
  );
  assert.equal(
    (
      await a.db`select count(*)::int as n from credit_packages where user_id=${uid}`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await b.db`select sum(remaining_credits)::int as n from credit_packages where user_id=${uid}`
    )[0].n,
    13,
  );
  assert.equal(
    (
      await b.db`select count(*)::int as n from credit_transactions where user_id=${uid}`
    )[0].n,
    1,
  );
  pass(
    "second-site admin grant and retry affect only its ledger, including identical fixture user IDs in both databases",
  );
  for (const [s, bytes] of [
    [a, Buffer.from("AUD003_SITE_A_FILE")],
    [b, Buffer.from("AUD003_SITE_B_FILE")],
  ]) {
    await s.db`insert into tasks (id,user_id,request_id,input_hash,tool_id,status,input,provider,model,execution_config,credits,queue_deadline) values (${taskId},${uid},${randomUUID()},'aud003','video-generation','SUCCEEDED','{}','fixture','fixture','{}',1,now())`;
    const directory = path.join(s.root, s.site.isolation.localVideoDirectory);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, taskId + ".mp4");
    await writeFile(file, bytes, { flag: "wx" });
    files.push(file);
    await s.db`insert into task_assets (task_id,user_id,storage_key,mime,byte_length,sha256) values (${taskId},${uid},${taskId + ".mp4"},'video/mp4',${bytes.length},${createHash("sha256").update(bytes).digest("hex")})`;
    const result = await request(s, `/api/v1/tools/video/tasks/${taskId}/file`);
    assert.equal(result.status, 200);
    assert.equal(result.text, bytes.toString());
  }
  const [real] =
    await a.db`select task_id from task_assets where task_id<>${taskId} limit 1`;
  if (real)
    assert.equal(
      (await request(b, `/api/v1/tools/video/tasks/${real.task_id}/file`))
        .status,
      404,
    );
  pass(
    "same task ID serves different private files on each site; main-site historical asset is absent from the second site",
  );
  // Exercise both flags in the original running server; all saves restored in finally.
  const policyBefore = await snapshot(a);
  for (const disabled of ["text-summary", "video-generation", "both"]) {
    const manifest = JSON.parse(a.raw);
    for (const id of ["text-summary", "video-generation"])
      manifest.tools[id] = disabled !== "both" && disabled !== id;
    await writeManifest(a, manifest);
    for (const [id, route] of [
      ["text-summary", "text-summary"],
      ["video-generation", "video"],
    ])
      if (!manifest.tools[id]) {
        const result = await request(a, `/api/v1/tools/${route}`, {});
        assert.equal(result.status, 403);
        assert.equal(result.data.error.details.code, "TOOL_DISABLED");
        const cfg = await request(a, `/api/v1/tools/${route}`);
        assert.equal(cfg.data.data.enabled, false);
        assert.equal(cfg.data.data.reason, "TOOL_DISABLED");
      }
    assert.deepEqual(await snapshot(a), policyBefore);
  }
  await writeManifest(a, a.raw);
  const disabled = await request(b, "/api/v1/tools/video", {});
  assert.equal(disabled.status, 403);
  const missing = await request(b, "/api/v1/tools/text-summary", {
    requestId: randomUUID(),
    input: {
      text: "这是用于验证第二站没有模型密钥时不会扣除积分的独立测试内容。",
      length: "short",
      language: "zh",
    },
  });
  assert.equal(missing.status, 503);
  pass(
    "each tool and both tools disabled: POST 403 before payload/provider/credits; GET unavailable; enabled tool with missing second-site key returns 503 without charging",
  );
  const studio = await request(b, "/api/ui-studio/config");
  assert.equal(studio.status, 200);
  const changed = structuredClone(a.site.ui);
  changed.brand.name = "Aurora Notes QA";
  const saved = await request(
    b,
    "/api/ui-studio/config",
    { revision: studio.data.revision, config: changed },
    { method: "PUT", headers: { "x-ui-studio-token": studio.data.token } },
  );
  assert.equal(saved.status, 200);
  const actual = JSON.parse(
    await readFile(path.join(b.root, "src/config/site.json"), "utf8"),
  );
  assert.deepEqual(actual.tools, b.site.tools);
  assert.deepEqual(actual.local, b.site.local);
  assert.equal(actual.ui.brand.name, "Aurora Notes QA");
  assert.equal(
    await readFile(path.join(a.root, "src/config/site.json"), "utf8"),
    a.raw,
  );
  assert.equal(
    (
      await request(
        b,
        "/api/ui-studio/config",
        { revision: studio.data.revision, config: changed },
        { method: "PUT", headers: { "x-ui-studio-token": studio.data.token } },
      )
    ).status,
    409,
  );
  await writeManifest(b, b.raw);
  pass(
    "UI Studio writes only its site UI while preserving policy/identity; stale revisions rejected; first-site config unchanged",
  );
} finally {
  await Promise.all([writeManifest(a, a.raw), writeManifest(b, b.raw)]);
  for (const file of files) await unlink(file);
  for (const s of [a, b]) {
    await s.db.begin(async (tx) => {
      await tx`delete from task_assets where task_id=${taskId}`;
      await tx`delete from tasks where id=${taskId}`;
      await tx`delete from admin_operations where target_user_id=${uid}`;
      await tx`delete from credit_transactions where user_id=${uid}`;
      await tx`delete from credit_packages where user_id=${uid}`;
      await tx`delete from "user" where id=${uid}`;
    });
    await request(s, "/api/auth/sign-out", {});
  }
  const after = await Promise.all([a, b].map(snapshot));
  assert.deepEqual(
    after,
    before,
    "Retained financial/task state must be unchanged",
  );
  await Promise.all([a.db.end(), b.db.end()]);
}
await writeFile(
  path.join(root, "docs/project-state/aud-003-isolation-results.json"),
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      sites: [a.site.id, b.site.id],
      passed,
      fixturesRemoved: true,
      financialStateUnchanged: true,
      realProviderCalls: 0,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Completed ${passed.length} isolation groups; all temporary fixtures removed.`,
);
