import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/laconic_local" || url.username !== "laconic_local") throw new Error("Seeding is restricted to the dedicated local test database.");
const sql = postgres(url.toString(), { ssl: false, max: 1 });
try {
  const accounts = [
    { email: process.env.LOCAL_ADMIN_EMAIL, password: process.env.LOCAL_ADMIN_PASSWORD, name: "本地测试管理员", admin: true },
    { email: "member@laconic.local", password: process.env.LOCAL_MEMBER_PASSWORD, name: "本地普通测试用户", admin: false },
  ];
  for (const account of accounts) {
    if (!account.email || !account.password || !account.email.endsWith("@laconic.local")) throw new Error("Missing or invalid dedicated local credentials.");
    const hash = await hashPassword(account.password);
    await sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(664301)`;
      const [user] = await tx`insert into "user" (id,name,email,"emailVerified","isAdmin") values (${randomUUID()},${account.name},${account.email},true,${account.admin}) on conflict (email) do update set name=excluded.name,"emailVerified"=true,"isAdmin"=excluded."isAdmin" returning id`;
      await tx`insert into account (id,"accountId","providerId","userId",password) values (${randomUUID()},${user.id},'credential',${user.id},${hash}) on conflict ("providerId","accountId") do update set password=excluded.password`;
      if (!(await tx`select id from "Customer" where "authUserId"=${user.id}`).length) await tx`insert into "Customer" ("authUserId",name,plan) values (${user.id},${account.name},'FREE')`;
      const seedOrder = `LOCAL_TEST_SEED_${user.id}`;
      if (account.admin && !(await tx`select id from credit_packages where order_no=${seedOrder}`).length) {
        const [pkg] = await tx`insert into credit_packages (user_id,initial_credits,remaining_credits,frozen_credits,trans_type,order_no,status,expired_at) values (${user.id},100,100,0,'SYSTEM_ADJUST',${seedOrder},'ACTIVE',now()+interval '365 days') returning id`;
        await tx`insert into credit_transactions (trans_no,user_id,trans_type,credits,balance_after,package_id,order_no,remark) values (${`LOCAL_${randomUUID()}`},${user.id},'SYSTEM_ADJUST',100,100,${pkg.id},${seedOrder},'本地测试初始化赠送，非真实购买')`;
      }
    });
    console.log(`Seeded ${account.admin ? "administrator" : "ordinary test user"}: ${account.email} (password not printed)`);
  }
} finally { await sql.end(); }
