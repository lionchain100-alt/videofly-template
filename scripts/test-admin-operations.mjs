import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/laconic_local")
  throw new Error("Tests only run against the dedicated local database.");
const db = postgres(url.toString(), { ssl: false, max: 3 });
const base = "http://localhost:3000";
const run = randomUUID().slice(0, 8);
const userId = randomUUID();
const email = `qa-admin-${run}@laconic.local`;
const password = `Test-${randomUUID()}!`;
const requestIds = [];
const passed = [];
const trigger = `qa_admin_${run}`;
let triggerCreated = false;
function client() {
  let cookie = "";
  return {
    async request(path, body, extraHeaders = {}) {
      const response = await fetch(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: cookie,
          Origin: base,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      });
      const set = response.headers.getSetCookie();
      if (set.length) {
        const jar = new Map(
          cookie
            .split("; ")
            .filter(Boolean)
            .map((v) => [v.slice(0, v.indexOf("=")), v]),
        );
        for (const item of set) {
          const pair = item.split(";")[0];
          jar.set(pair.slice(0, pair.indexOf("=")), pair);
        }
        cookie = [...jar.values()].join("; ");
      }
      let data;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      return { status: response.status, data };
    },
  };
}
const admin = client();
const member = client();
const anonymous = client();
const pass = (message) => {
  passed.push(message);
  console.log(`PASS ${message}`);
};
function grant(overrides = {}) {
  const requestId = randomUUID();
  requestIds.push(requestId);
  return {
    requestId,
    userId,
    credits: 13,
    expiryDays: 30,
    remark: "后台自动验收临时发放",
    ...overrides,
  };
}
async function counts() {
  return (
    await db`select (select count(*)::int from credit_packages where user_id=${userId}) as packages, (select count(*)::int from credit_transactions where user_id=${userId}) as ledger, (select count(*)::int from admin_operations where target_user_id=${userId}) as audit, (select coalesce(sum(remaining_credits),0)::int from credit_packages where user_id=${userId} and status='ACTIVE' and (expired_at is null or expired_at>${new Date().toISOString()}::timestamp)) as available`
  )[0];
}

try {
  await db`insert into "user" (id,name,email,"emailVerified","isAdmin") values (${userId},'后台自动验收临时用户',${email},true,false)`;
  await db`insert into account (id,"accountId","providerId","userId",password) values (${randomUUID()},${userId},'credential',${userId},${await hashPassword(password)})`;
  assert.equal(
    (
      await admin.request("/api/auth/sign-in/email", {
        email: process.env.LOCAL_ADMIN_EMAIL,
        password: process.env.LOCAL_ADMIN_PASSWORD,
      })
    ).status,
    200,
  );
  assert.equal((await member.request("/api/auth/sign-in/email", { email, password })).status, 200);
  const [owner] = await db`select id from "user" where email=${process.env.LOCAL_ADMIN_EMAIL}`;
  const before = await counts();
  const input = grant();
  assert.equal((await anonymous.request("/api/v1/admin/credits/add", input)).status, 401);
  assert.equal((await member.request("/api/v1/admin/credits/add", input)).status, 403);
  assert.equal(
    (await admin.request("/api/v1/admin/credits/add", input, { Origin: "https://other.example" }))
      .status,
    403,
  );
  for (const patch of [
    { credits: 0 },
    { credits: -1 },
    { credits: 1.5 },
    { credits: "10" },
    { credits: 100001 },
    { expiryDays: 0 },
    { expiryDays: 3651 },
    { remark: " " },
    { userId: "" },
    { requestId: "invalid" },
  ])
    assert.equal(
      (await admin.request("/api/v1/admin/credits/add", { ...input, ...patch })).status,
      400,
    );
  assert.equal(
    (await admin.request("/api/v1/admin/credits/add", grant({ userId: randomUUID() }))).status,
    404,
  );
  assert.deepEqual(await counts(), before);
  pass("unauthorized, CSRF, invalid amounts/expiry/reason and missing users cannot change credits");

  const concurrent = await Promise.all(
    Array.from({ length: 8 }, () => admin.request("/api/v1/admin/credits/add", input)),
  );
  assert(
    concurrent.every((r) => r.status === 200),
    JSON.stringify(concurrent),
  );
  assert.equal(concurrent.filter((r) => r.data.data.replayed === false).length, 1);
  const after = await counts();
  assert.equal(after.available, before.available + 13);
  assert.equal(after.packages, before.packages + 1);
  assert.equal(after.ledger, before.ledger + 1);
  assert.equal(after.audit, before.audit + 1);
  const [audit] = await db`select * from admin_operations where request_id=${input.requestId}`;
  assert.equal(audit.actor_user_id, owner.id);
  assert.equal(audit.target_user_id, userId);
  assert.equal(audit.reason, input.remark);
  assert(audit.package_id && audit.transaction_id);
  const [entry] = await db`select * from credit_transactions where id=${audit.transaction_id}`;
  assert.equal(entry.actor_user_id, owner.id);
  assert.equal(entry.package_id, audit.package_id);
  assert.equal(entry.balance_after, after.available);
  assert.equal(
    (await admin.request("/api/v1/admin/credits/add", { ...input, credits: 14 })).status,
    409,
  );
  pass(
    "8 concurrent retries create exactly one package, ledger entry and attributable audit record",
  );

  const distinct = [3, 4, 5, 6].map((credits) => grant({ credits }));
  const distinctResponses = await Promise.all(
    distinct.map((value) => admin.request("/api/v1/admin/credits/add", value)),
  );
  assert(distinctResponses.every((r) => r.status === 200));
  assert.equal((await counts()).available, after.available + 18);
  pass("distinct concurrent grants serialize balances without losing credits");

  // Fail only this test user's explicitly marked ledger insert, after its package has been inserted.
  await db.unsafe(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id = '${userId}' AND NEW.remark = 'QA_ROLLBACK_ONLY' THEN RAISE EXCEPTION 'Intentional isolated test failure'; END IF; RETURN NEW; END $$`,
  );
  await db.unsafe(
    `CREATE TRIGGER ${trigger} BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
  );
  triggerCreated = true;
  const beforeFailure = await counts();
  const fault = grant({ remark: "QA_ROLLBACK_ONLY" });
  assert.equal((await admin.request("/api/v1/admin/credits/add", fault)).status, 500);
  assert.deepEqual(await counts(), beforeFailure);
  await db.unsafe(`DROP TRIGGER ${trigger} ON credit_transactions`);
  await db.unsafe(`DROP FUNCTION ${trigger}()`);
  triggerCreated = false;
  assert.equal((await admin.request("/api/v1/admin/credits/add", fault)).status, 200);
  assert.equal((await counts()).available, beforeFailure.available + 13);
  pass(
    "mid-transaction failure rolls back package, ledger and audit; same request can safely retry",
  );

  const disable = {
    requestId: randomUUID(),
    userId,
    disabled: true,
    reason: "后台自动验收停用测试",
  };
  assert.equal((await admin.request("/api/v1/admin/users/status", disable)).status, 200);
  assert.equal(
    (await admin.request("/api/v1/admin/users/status", disable)).data.data.replayed,
    true,
  );
  assert.equal((await member.request("/api/v1/credit/balance")).status, 401);
  assert((await client().request("/api/auth/sign-in/email", { email, password })).status >= 400);
  assert.equal((await admin.request("/api/v1/admin/credits/add", grant())).status, 409);
  assert.equal(
    (
      await admin.request("/api/v1/admin/users/status", {
        ...disable,
        requestId: randomUUID(),
        userId: owner.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.request("/api/v1/admin/users/status", {
        requestId: randomUUID(),
        userId,
        disabled: false,
        reason: "后台自动验收恢复测试",
      })
    ).status,
    200,
  );
  assert.equal((await member.request("/api/v1/credit/balance")).status, 401);
  assert.equal((await member.request("/api/auth/sign-in/email", { email, password })).status, 200);
  assert.equal((await member.request("/api/v1/credit/balance")).status, 200);
  pass(
    "disable revokes sessions and prevents re-login/grants; restore requires a fresh login; owner is protected",
  );
  await admin.request("/api/auth/sign-out", {});
  await member.request("/api/auth/sign-out", {});
} finally {
  if (triggerCreated) {
    await db.unsafe(`DROP TRIGGER IF EXISTS ${trigger} ON credit_transactions`);
    await db.unsafe(`DROP FUNCTION IF EXISTS ${trigger}()`);
  }
  await db.begin(async (tx) => {
    await tx`delete from admin_operations where target_user_id=${userId}`;
    await tx`delete from credit_transactions where user_id=${userId}`;
    await tx`delete from credit_holds where user_id=${userId}`;
    await tx`delete from credit_packages where user_id=${userId}`;
    await tx`delete from session where "userId"=${userId}`;
    await tx`delete from account where "userId"=${userId}`;
    await tx`delete from "Customer" where "authUserId"=${userId}`;
    await tx`delete from "user" where id=${userId}`;
  });
  await db.end();
  console.log(`Completed ${passed.length} integration groups; temporary fixtures removed.`);
}
