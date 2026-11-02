import { sql } from "drizzle-orm";
import { db } from "@/db";
import { siteManifest } from "@/config/site-manifest";
import { z } from "zod";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function initializeOwner(
  tx: Tx,
  email: string,
  reason: string,
  apply = false,
) {
  z.email().parse(email);
  z.string().trim().min(12).max(300).parse(reason);
  await tx.execute(sql`select pg_advisory_xact_lock(700008)`);
  const [user] = await tx.execute(
    sql`select id,email,"emailVerified",disabled,"isAdmin" from "user" where lower(email)=${email.toLowerCase()} for update`,
  );
  if (!user || !user.emailVerified || user.disabled)
    throw Error("Owner must be an existing verified and enabled account");
  const admins = await tx.execute(
    sql`select id from "user" where "isAdmin"=true`,
  );
  if (user.isAdmin) return { status: "already-admin", changed: false };
  if (admins.length)
    throw Error(
      "An administrator already exists; use the existing administrator, not bootstrap",
    );
  const audit = await tx.execute(
    sql`select site_id from owner_initializations where site_id=${siteManifest.id}`,
  );
  if (audit.length)
    throw Error(
      "Owner was already initialized; use a separate audited recovery procedure",
    );
  if (!apply) return { status: "eligible-dry-run", changed: false };
  await tx.execute(
    sql`insert into owner_initializations(site_id,user_id,email,reason)values(${siteManifest.id},${user.id},${user.email},${reason})`,
  );
  await tx.execute(sql`update "user" set "isAdmin"=true where id=${user.id}`);
  return { status: "initialized", changed: true };
}
export async function bootstrapOwner(
  email: string,
  reason: string,
  apply = false,
) {
  return db.transaction((tx) => initializeOwner(tx, email, reason, apply));
}
