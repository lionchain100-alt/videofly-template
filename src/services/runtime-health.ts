import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, workerHeartbeats } from "@/db";
import { siteManifest } from "@/config/site-manifest";
import { readSiteManifest } from "@/config/site-server";
import { assetBackend, privateStorageReady } from "./private-storage";
import { assetPath } from "./video-assets";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
export type WorkerKind = "text" | "video" | "payments";
export async function startHeartbeat(kind: WorkerKind) {
  const instanceId = randomUUID();
  const siteId = siteManifest.id;
  let stopped = false;
  let progressAt = new Date();
  let lastError: string | null = null;
  let inflight = Promise.resolve();
  const beat = () => {
    inflight = inflight
      .then(async () => {
        if (stopped) return;
        await db
          .insert(workerHeartbeats)
          .values({
            siteId,
            kind,
            instanceId,
            heartbeatAt: new Date(),
            progressAt,
            status: "RUNNING",
            lastError,
          })
          .onConflictDoUpdate({
            target: [
              workerHeartbeats.siteId,
              workerHeartbeats.kind,
              workerHeartbeats.instanceId,
            ],
            set: {
              heartbeatAt: new Date(),
              progressAt,
              status: "RUNNING",
              lastError,
            },
          });
      })
      .catch(() => {});
    return inflight;
  };
  await beat();
  const timer = setInterval(() => void beat(), 5000);
  timer.unref();
  return {
    instanceId,
    progress: async (error = false) => {
      progressAt = new Date();
      lastError = error
        ? "Worker step failed; see scoped job diagnostics"
        : null;
      await beat();
    },
    stop: async () => {
      clearInterval(timer);
      await inflight;
      stopped = true;
      await db
        .update(workerHeartbeats)
        .set({ status: "STOPPED", heartbeatAt: new Date() })
        .where(
          and(
            eq(workerHeartbeats.siteId, siteId),
            eq(workerHeartbeats.kind, kind),
            eq(workerHeartbeats.instanceId, instanceId),
          ),
        )
        .catch(() => {});
    },
  };
}
let cached: { at: number; value: any } | undefined;
let pending: Promise<any> | undefined;
async function inspect() {
  let database = false;
  let storage = false;
  let rows: (typeof workerHeartbeats.$inferSelect)[] = [];
  try {
    await db.execute(sql`select 1`);
    rows = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.siteId, siteManifest.id));
    database = true;
  } catch {}
  try {
    if (assetBackend() === "local") {
      const root = path.dirname(assetPath(randomUUID()));
      await mkdir(root, { recursive: true });
      const probe = path.join(root, `.health-${randomUUID()}`);
      try {
        await writeFile(probe, "probe", { flag: "wx" });
        storage = true;
      } finally {
        await unlink(probe).catch(() => {});
      }
    } else storage = await privateStorageReady();
  } catch {}
  const manifest = await readSiteManifest();
  const required: WorkerKind[] = ["payments"];
  if (manifest.tools["text-summary"]) required.push("text");
  if (manifest.tools["video-generation"]) required.push("video");
  const now = Date.now();
  const ttl = 30000;
  const progressTTL = 180000;
  const workers = required.map((kind) => {
    const active = rows
      .filter(
        (r) =>
          r.kind === kind &&
          r.status === "RUNNING" &&
          now - r.heartbeatAt.getTime() <= ttl &&
          now - r.progressAt.getTime() <=
            (kind === "video" ? 300000 : progressTTL),
      )
      .sort((a, b) => b.heartbeatAt.getTime() - a.heartbeatAt.getTime());
    return {
      kind,
      ready: active.length > 0,
      instances: active.length,
      lastHeartbeat: active[0]?.heartbeatAt || null,
      lastProgress: active[0]?.progressAt || null,
    };
  });
  return {
    ready: database && storage && workers.every((w) => w.ready),
    checks: { database, storage, workers: workers.every((w) => w.ready) },
    workers,
    storageBackend: assetBackend(),
    checkedAt: new Date().toISOString(),
  };
}
export async function runtimeHealth(fresh = false) {
  if (!fresh && cached && Date.now() - cached.at < 3000) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    let timer: ReturnType<typeof setTimeout>;
    try {
      const value = await Promise.race([
        inspect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Readiness deadline")), 4000);
        }),
      ]);
      cached = { at: Date.now(), value };
      return value;
    } catch {
      return {
        ready: false,
        checks: { database: false, storage: false, workers: false },
        workers: [],
        checkedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer!);
      pending = undefined;
    }
  })();
  return pending;
}
