import { eq, sql } from "drizzle-orm";
import { adminTaskRows, creditPackages, db, users } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TaskCounts = {
  total: number;
  recent: number;
  succeeded: number;
  failed: number;
  pending: number;
  other: number;
  successRate: number;
};
const empty = (): TaskCounts => ({
  total: 0,
  recent: 0,
  succeeded: 0,
  failed: 0,
  pending: 0,
  other: 0,
  successRate: 0,
});

/** Same population as the default task list: existing owners, including deletion markers.
 * Recent means [now - 168 hours, now], using the view's UTC timestamps.
 * executor/owner allow rollback-only integration tests without touching live tasks.
 */
export async function getTaskOverview(
  now = new Date(),
  executor: typeof db | Tx = db,
  owner?: string,
) {
  const since = new Date(now.getTime() - 7 * 86400000);
  const rows = await executor
    .select({
      kind: adminTaskRows.kind,
      status: adminTaskRows.status,
      total: sql<number>`count(*)`.mapWith(Number),
      recent:
        sql<number>`count(*) filter (where ${adminTaskRows.createdAt} >= ${since.toISOString()}::timestamptz and ${adminTaskRows.createdAt} <= ${now.toISOString()}::timestamptz)`.mapWith(
          Number,
        ),
    })
    .from(adminTaskRows)
    .innerJoin(users, eq(users.id, adminTaskRows.userId))
    .where(owner ? eq(adminTaskRows.userId, owner) : undefined)
    .groupBy(adminTaskRows.kind, adminTaskRows.status);
  const result = {
    all: empty(),
    text: empty(),
    video: empty(),
    other: empty(),
  };
  for (const row of rows) {
    const kind =
      row.kind === "text-summary"
        ? "text"
        : ["video", "video-generation"].includes(row.kind)
          ? "video"
          : "other";
    const phase = ["COMPLETED", "SUCCEEDED"].includes(row.status)
      ? "succeeded"
      : row.status === "FAILED"
        ? "failed"
        : ["PENDING", "QUEUED", "RUNNING", "GENERATING", "UPLOADING"].includes(
              row.status,
            )
          ? "pending"
          : "other";
    for (const counts of [result.all, result[kind]]) {
      counts.total += row.total;
      counts.recent += row.recent;
      counts[phase] += row.total;
    }
  }
  for (const counts of Object.values(result)) {
    const finished = counts.succeeded + counts.failed;
    counts.successRate = finished ? (100 * counts.succeeded) / finished : 0;
  }
  return result;
}

export async function getDashboardOverview(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86400000);
  const [taskStats, [people], [packages]] = await Promise.all([
    getTaskOverview(now),
    db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        recent:
          sql<number>`count(*) filter (where ${users.createdAt} >= ${since.toISOString()}::timestamp and ${users.createdAt} <= ${now.toISOString()}::timestamp)`.mapWith(
            Number,
          ),
      })
      .from(users),
    db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(creditPackages),
  ]);
  return { tasks: taskStats, users: people, packages: packages.total };
}
