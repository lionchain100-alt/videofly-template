import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readdir, lstat, unlink, realpath } from "node:fs/promises";
import path from "node:path";
import { and, eq, lt } from "drizzle-orm";
import { assetPath } from "../src/services/video-assets";
import { privateS3, privateS3Config } from "../src/services/private-storage";
let close = async () => {};
async function main() {
  const { db, privateUploads } = await import("../src/db");
  const { uploadPath, uploadTypes } = await import(
    "../src/services/private-uploads"
  );
  close = async () => {
    await db.$client.end({ timeout: 5 });
  };
  const apply = process.argv.includes("--apply"),
    root = path.dirname(assetPath("00000000-0000-0000-0000-000000000000")),
    now = Date.now(),
    actions = [];
  const absolute = await realpath(root);
  for (const name of await readdir(root)) {
    if (!/^[0-9a-f-]{36}\.[0-9a-f-]{36}\.tmp$/.test(name)) continue;
    const file = path.join(root, name),
      s = await lstat(file);
    if (s.isSymbolicLink() || !s.isFile() || now - s.mtimeMs < 3600000)
      continue;
    const resolved = await realpath(file);
    if (path.dirname(resolved) !== absolute)
      throw Error("Cleanup target escapes private root");
    actions.push({ kind: "stale-download", name });
    if (apply) await unlink(file);
  }
  const rows = await db
    .select()
    .from(privateUploads)
    .where(
      and(
        lt(privateUploads.updatedAt, new Date(now - 900000)),
        eq(privateUploads.status, "WRITING"),
      ),
    );
  for (const r of rows) {
    actions.push({ kind: "abandoned-upload", id: r.id });
    if (!apply) continue;
    const claimed = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(privateUploads)
        .where(eq(privateUploads.id, r.id))
        .for("update");
      if (
        !current ||
        current.status !== "WRITING" ||
        current.updatedAt.getTime() > now - 900000
      )
        return false;
      await tx
        .update(privateUploads)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(privateUploads.id, r.id));
      return true;
    });
    if (!claimed) continue;
    try {
      if (r.storageBackend === "local") await unlink(uploadPath(r.storageKey));
      else if (
        r.storageScope === privateS3Config().scope &&
        r.storageKey ===
          `${privateS3Config().prefix}/uploads/${r.id}.${uploadTypes[r.mime]}`
      )
        await (await privateS3()).deleteObject(r.storageKey);
    } catch {}
  }
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      actions,
      retainedRegisteredResults: true,
    }),
  );
}
main()
  .catch(() => {
    console.error(
      "Storage maintenance failed; no registered result is deleted",
    );
    process.exitCode = 1;
  })
  .finally(() => close());
