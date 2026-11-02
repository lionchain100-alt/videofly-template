import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
async function main() {
  const { productionAuthConfig, safeLoginReturn } = await import(
    "../src/lib/auth/production-config"
  );
  const base = {
    NEXT_PUBLIC_APP_URL: "https://owner.example",
    GOOGLE_CLIENT_ID: "fixture.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "fixture-google-secret",
    RESEND_API_KEY: "re_fixture_secret",
    RESEND_FROM: "auth@owner.example",
  };
  assert.deepEqual(productionAuthConfig({}), {
    google: false,
    email: false,
    ready: false,
    secureOrigin: false,
  });
  assert(productionAuthConfig(base).ready);
  assert(
    !productionAuthConfig({
      ...base,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    }).ready,
  );
  assert(
    !productionAuthConfig({
      ...base,
      AUTH_GOOGLE_ENABLED: "false",
      AUTH_EMAIL_ENABLED: "false",
    }).ready,
  );
  assert(
    !productionAuthConfig({
      ...base,
      GOOGLE_CLIENT_ID: "local-disabled",
      RESEND_API_KEY: "re_local_disabled",
    }).ready,
  );
  assert.equal(safeLoginReturn("//outside.invalid", "/"), "/");
  assert.equal(safeLoginReturn("/%2foutside.invalid", "/"), "/");
  assert.equal(safeLoginReturn("/\\outside.invalid", "/"), "/");
  assert.equal(safeLoginReturn("/zh/text-summary", "/"), "/zh/text-summary");
  const { db } = await import("../src/db"),
    { users } = await import("../src/db/schema"),
    { sql } = await import("drizzle-orm"),
    { initializeOwner } = await import("../src/services/owner-initialization");
  const u = new URL(process.env.DATABASE_URL!);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.pathname, "/laconic_local");
  const rollback = Error("ROLLBACK_OWNER_FIXTURE"),
    id = randomUUID(),
    email = id + "@example.invalid";
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx
          .insert(users)
          .values({
            id,
            name: "Owner init fixture",
            email,
            emailVerified: true,
            isAdmin: false,
          });
        await assert.rejects(
          initializeOwner(
            tx,
            email,
            "Owner isolated first-account initialization",
            true,
          ),
          /administrator already exists/,
        );
        await tx.execute(
          sql`update "user" set "isAdmin"=false where "isAdmin"=true`,
        );
        assert.equal(
          (
            await initializeOwner(
              tx,
              email,
              "Owner isolated first-account initialization",
              false,
            )
          ).changed,
          false,
        );
        assert.equal(
          (
            await initializeOwner(
              tx,
              email,
              "Owner isolated first-account initialization",
              true,
            )
          ).changed,
          true,
        );
        assert.equal(
          (
            await initializeOwner(
              tx,
              email,
              "Owner isolated first-account initialization",
              true,
            )
          ).changed,
          false,
        );
        const [audit] = await tx.execute(
          sql`select count(*)::int as n from owner_initializations where user_id=${id}`,
        );
        assert.equal(audit.n, 1);
        await tx.execute(
          sql`update "user" set "emailVerified"=false where id=${id}`,
        );
        await assert.rejects(
          initializeOwner(
            tx,
            email,
            "Owner isolated first-account initialization",
            true,
          ),
          /verified/,
        );
        throw rollback;
      }),
      (e) => e === rollback,
    );
    const [count] = await db.execute(
      sql`select count(*)::int as n from owner_initializations`,
    );
    assert.equal(count.n, 0);
    await writeFile(
      "docs/project-state/aud-008-auth-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          configurationChecks: true,
          placeholderAndInsecureOriginClosed: true,
          safeRelativeRedirects: true,
          ownerInitialization: {
            existingVerifiedOnly: true,
            firstAdminOnly: true,
            dryRun: true,
            auditAtomic: true,
            idempotent: true,
            allFixturesRolledBack: true,
          },
          realOAuthCallback: false,
          realEmailDelivery: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS production auth configuration, redirect guards and atomic first verified Owner initialization",
    );
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
