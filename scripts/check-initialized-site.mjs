import assert from "node:assert/strict";
import { config } from "dotenv";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { localDatabaseUrl, site } from "./local-site.mjs";
config({ path: ".env.local", quiet: true });
const db = postgres(localDatabaseUrl().href, { ssl: false, max: 1 });
try {
  const applied = await db`select name, checksum from project_migrations order by name`;
  const files = (await readdir("src/db/migrations")).filter(n => /^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  assert.deepEqual(applied.map(r => r.name), files);
  for (const row of applied) assert.equal(row.checksum, createHash("sha256").update(await readFile(`src/db/migrations/${row.name}`)).digest("hex"));
  const [counts] = await db`select (select count(*)::int from "user")as users,(select count(*)::int from tasks)as tasks,(select count(*)::int from task_assets)as assets,(select count(*)::int from payment_orders)as orders,(select count(*)::int from payment_refunds)as refunds,(select count(*)::int from ai_policy_versions)as policies,(select count(*)::int from ai_cost_usage)as costs,(select count(*)::int from owner_initializations)as owner_audits`;
  assert.deepEqual(counts, { users: 2, tasks: 0, assets: 0, orders: 0, refunds: 0, policies: 1, costs: 0, owner_audits: 0 });
  const [admin] = await db`select u."isAdmin" as admin,sum(p.remaining_credits)::int as available,sum(p.frozen_credits)::int as frozen,sum(p.refund_reserved_credits)::int as reserved,count(p.id)::int as packages from "user"u join credit_packages p on p.user_id=u.id where u.email=${process.env.LOCAL_ADMIN_EMAIL} group by u.id`;
  assert.deepEqual(admin, { admin: true, available: 100, frozen: 0, reserved: 0, packages: 1 });
  const [role] = await db`select rolsuper,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user`;
  assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  console.log(JSON.stringify({ site: site.id, migrations: applied.length, counts, administratorSeed: admin, restrictedDatabaseRole: true }));
} finally { await db.end(); }
