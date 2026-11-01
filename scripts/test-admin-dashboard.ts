import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  const { db, users, tasks, videos } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { getTaskOverview } = await import("../src/lib/admin/dashboard");
  const rollback = new Error("ROLLBACK_DASHBOARD_FIXTURES");
  const now = new Date("2026-11-01T12:00:00.000Z");
  const since = new Date(now.getTime() - 7 * 86400000);
  const old = new Date(since.getTime() - 1);
  const future = new Date(now.getTime() + 1);
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        const owner = randomUUID();
        await tx
          .insert(users)
          .values({
            id: owner,
            name: "Dashboard rollback fixture",
            email: `overview-${owner}@example.invalid`,
          });
        const zero = await getTaskOverview(now, tx, owner);
        for (const counts of Object.values(zero))
          assert.deepEqual(counts, {
            total: 0,
            recent: 0,
            succeeded: 0,
            failed: 0,
            pending: 0,
            other: 0,
            successRate: 0,
          });
        async function task(toolId: string, status: string, createdAt: Date) {
          await tx
            .insert(tasks)
            .values({
              id: randomUUID(),
              userId: owner,
              requestId: randomUUID(),
              inputHash: "fixture",
              toolId,
              status,
              createdAt,
              input: { text: "isolated fixture" },
              provider: "fixture",
              model: "fixture",
              executionConfig: {},
              credits: 1,
              queueDeadline: new Date(now.getTime() + 60000),
            });
        }
        for (const [status, time] of [
          ["SUCCEEDED", now],
          ["FAILED", since],
          ["QUEUED", now],
          ["RUNNING", old],
          ["SUCCEEDED", future],
        ] as const)
          await task("text-summary", status, time);
        for (const [status, time] of [
          ["SUCCEEDED", now],
          ["FAILED", old],
          ["QUEUED", now],
          ["RUNNING", now],
        ] as const)
          await task("video-generation", status, time);
        for (const [status, time, deleted] of [
          ["COMPLETED", since, false],
          ["GENERATING", now, false],
          ["UPLOADING", old, false],
          ["PENDING", now, false],
          ["FAILED", now, true],
          ["COMPLETED", old, false],
        ] as const) {
          await tx
            .insert(videos)
            .values({
              uuid: randomUUID(),
              userId: owner,
              model: "fixture",
              prompt: "isolated fixture",
              status,
              createdAt: time,
              isDeleted: deleted,
            });
        }
        await task("future-tool", "FAILED", now);
        const result = await getTaskOverview(now, tx, owner);
        assert.deepEqual(result.text, {
          total: 5,
          recent: 3,
          succeeded: 2,
          failed: 1,
          pending: 2,
          other: 0,
          successRate: 200 / 3,
        });
        assert.deepEqual(result.video, {
          total: 10,
          recent: 7,
          succeeded: 3,
          failed: 2,
          pending: 5,
          other: 0,
          successRate: 60,
        });
        assert.deepEqual(result.other, {
          total: 1,
          recent: 1,
          succeeded: 0,
          failed: 1,
          pending: 0,
          other: 0,
          successRate: 0,
        });
        assert.deepEqual(result.all, {
          total: 16,
          recent: 11,
          succeeded: 5,
          failed: 4,
          pending: 7,
          other: 0,
          successRate: 500 / 9,
        });
        await tx.execute(sql`set local timezone = 'Asia/Shanghai'`);
        assert.deepEqual(await getTaskOverview(now, tx, owner), result);
        console.log(
          "PASS empty data, summary/new+legacy video grouping, terminal-state denominator, pending/other tools, deletion markers, exact 168h boundary and future exclusion, session timezone independence.",
        );
        throw rollback;
      }),
      (error) => error === rollback,
    );
    console.log(
      "PASS rollback-only fixtures: workers cannot observe test tasks; no model calls, credit changes or retained sample data.",
    );
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
