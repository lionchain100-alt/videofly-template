import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  realpath,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import postgres from "postgres";
import { siteManifest } from "../src/config/site-manifest";
import { uploadBody, uploadTypes } from "../src/services/private-uploads";
import {
  assetPath,
  storedAssetSize,
  storedAssetBody,
} from "../src/services/video-assets";
const root = process.cwd();
const site = siteManifest;
const url = new URL(process.env.DATABASE_URL || "");
function guard() {
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== String(site.local.databasePort) ||
    url.pathname !== `/${site.local.databaseName}` ||
    url.username !== site.local.databaseUser
  )
    throw Error("Backup scope must match this local site database");
}
function key() {
  const k = process.env.BACKUP_ENCRYPTION_KEY;
  if (!k || !/^[a-f0-9]{64}$/i.test(k))
    throw Error(
      "Configure BACKUP_ENCRYPTION_KEY as a dedicated 32-byte hex key; keep it outside backup bundles",
    );
  return Buffer.from(k, "hex");
}
function dbFor(u: URL) {
  return postgres(u.href, {
    ssl: false,
    max: 1,
    onnotice: () => {},
    connection: { application_name: "site-backup", TimeZone: "UTC" },
  });
}
function binary(name: string) {
  const ext = process.platform === "win32" ? ".exe" : "";
  return process.env.PG_BIN_DIR
    ? path.join(process.env.PG_BIN_DIR, name + ext)
    : process.platform === "win32"
      ? path.join(root, ".local/pg-tools", name + ext)
      : name;
}
function command(name: string, args: string[], u: URL) {
  const child = spawn(binary(name), args, {
    windowsHide: true,
    env: {
      ...process.env,
      PGHOST: u.hostname,
      PGPORT: u.port,
      PGUSER: decodeURIComponent(u.username),
      PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: u.pathname.slice(1),
      PGCONNECT_TIMEOUT: "5",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let fail = false;
  child.stderr.on("data", () => {
    fail = true;
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", () =>
      reject(
        Error(
          "PostgreSQL client unavailable; install clients or set PG_BIN_DIR",
        ),
      ),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Error(
              `${name} failed; check client version/target permissions (sensitive diagnostics suppressed)`,
            ),
          ),
    );
  });
  return { child, done };
}
async function digestFile(file: string) {
  const h = createHash("sha256");
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest("hex");
}
async function digestDb(db: ReturnType<typeof postgres>) {
  const tables =
    await db`select tablename from pg_tables where schemaname='public' order by tablename`;
  const result: Record<string, { rows: number; sha256: string }> = {};
  for (const t of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.tablename))
      throw Error("Unsupported table name");
    const rows = await db.unsafe(
      `select row_to_json(t)::text as data from public."${t.tablename}" t order by to_jsonb(t)::text`,
    );
    const h = createHash("sha256");
    for (const row of rows) h.update(row.data + "\n");
    result[t.tablename] = { rows: rows.length, sha256: h.digest("hex") };
  }
  return result;
}
async function ensureStopped(db: ReturnType<typeof postgres>) {
  const listening = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: site.local.port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
  if (listening)
    throw Error("Stop this site's Web and Workers before a consistent backup");
  for (let n = 0; n < 8; n++) {
    const [r] =
      await db`select count(*)::int as n from worker_heartbeats where site_id=${site.id} and status='RUNNING' and heartbeat_at>now()-interval '30 seconds'`;
    if (!r.n) return;
    if (n === 7)
      throw Error("Workers are still active; backup was not started");
    await new Promise((r) => setTimeout(r, 5000));
  }
}
type Entry = {
  file: string;
  iv: string;
  tag: string;
  sha256: string;
  plainSha256: string;
  bytes: number;
  taskId?: string;
  cache?: boolean;
  uploadId?: string;
  localKey?: string;
};
async function encrypt(
  input: NodeJS.ReadableStream,
  destination: string,
): Promise<Entry> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const h = createHash("sha256");
  let bytes = 0;
  const hash = new Transform({
    transform(chunk, _enc, cb) {
      h.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  await pipeline(
    input,
    hash,
    cipher,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  return {
    file: path.basename(destination),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    sha256: await digestFile(destination),
    plainSha256: h.digest("hex"),
    bytes,
  };
}
function signature(manifest: any) {
  return createHmac("sha256", key())
    .update(JSON.stringify(manifest))
    .digest("hex");
}
async function load(bundle: string) {
  const { signature: sig, ...m } = JSON.parse(
      await readFile(path.join(bundle, "manifest.json"), "utf8"),
    );
  const expected = signature(m);
  if (
    typeof sig !== "string" ||
    !/^[a-f0-9]{64}$/.test(sig) ||
    !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
  )
    throw Error("Backup key or manifest authentication failed");
  if (
    m.site.id !== site.id ||
    m.site.isolation.fileNamespace !== site.isolation.fileNamespace
  )
    throw Error("Backup belongs to a different site");
  for (const e of m.entries as Entry[]) {
    if (
      !/^[a-z0-9_-]+\.enc$/.test(e.file) ||
      (await digestFile(path.join(bundle, e.file))) !== e.sha256
    )
      throw Error("Encrypted backup payload integrity failed");
  }
  return m;
}
function decrypt(bundle: string, e: Entry) {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(e.iv, "hex"));
  d.setAuthTag(Buffer.from(e.tag, "hex"));
  return { input: createReadStream(path.join(bundle, e.file)), decrypt: d };
}
export async function createBackup() {
  guard();
  key();
  const db = dbFor(url);
  try {
    await ensureStopped(db);
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const folder = path.join(root, ".local/backups", id);
    await mkdir(folder, { recursive: false }).catch(async (e) => {
      if (e.code !== "ENOENT") throw e;
      await mkdir(path.dirname(folder), { recursive: true });
      await mkdir(folder);
    });
    const before = await digestDb(db);
    const entries: Entry[] = [];
    const pg = command(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-privileges"],
      url,
    );
    pg.child.stdin.end();
    const database = await encrypt(
      pg.child.stdout,
      path.join(folder, "database.enc"),
    );
    await pg.done;
    entries.push(database);
    const assets =
      await db`select task_id as "taskId",storage_key as "storageKey",storage_backend as "storageBackend",storage_scope as "storageScope",byte_length as "byteLength",sha256 from task_assets order by task_id`;
    for (const a of assets) {
      if ((await storedAssetSize(a as any)) !== a.byteLength)
        throw Error("Registered file size mismatch; backup not committed");
      const stream = await storedAssetBody(a as any, 0, a.byteLength - 1);
      if (!stream) throw Error("Registered asset missing");
      const e = await encrypt(
        Readable.fromWeb(stream as any),
        path.join(folder, `asset-${a.taskId}.enc`),
      );
      if (e.plainSha256 !== a.sha256)
        throw Error("Registered asset hash mismatch; backup not committed");
      entries.push({ ...e, taskId: a.taskId });
    }
    const uploads =
      await db`select id,user_id as "userId",storage_backend as "storageBackend",storage_scope as "storageScope",storage_key as "storageKey",mime,byte_length as "byteLength",sha256,status,created_at as "createdAt",updated_at as "updatedAt" from private_uploads where status='READY' order by id`;
    for (const a of uploads) {
      const response = await uploadBody(a as any);
      if (!response.ok || !response.body)
        throw Error("Registered upload missing");
      const e = await encrypt(
        Readable.fromWeb(response.body as any),
        path.join(folder, `upload-${a.id}.enc`),
      );
      if (e.plainSha256 !== a.sha256 || e.bytes !== a.byteLength)
        throw Error("Upload integrity mismatch");
      entries.push({
        ...e,
        uploadId: a.id,
        localKey: `uploads/${a.id}.${uploadTypes[a.mime]}`,
      });
    }
    const local = path.dirname(assetPath(randomUUID()));
    for (const name of await readdir(local).catch(() => [])) {
      if (
        !/^[0-9a-f-]{36}\.mp4$/.test(name) ||
        assets.some((a) => name === `${a.taskId}.mp4`)
      )
        continue;
      const id = name.slice(0, -4);
      const [task] = await db`select id from tasks where id=${id}`;
      if (!task) continue;
      entries.push({
        ...(await encrypt(
          createReadStream(path.join(local, name)),
          path.join(folder, `cache-${id}.enc`),
        )),
        taskId: id,
        cache: true,
      });
    }
    const after = await digestDb(db);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error(
        "Database changed during backup; no valid manifest was committed",
      );
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      site,
      sourceDatabase: site.local.databaseName,
      entries,
      digest: before,
      credentialsExcluded: true,
      quiescent: true,
    };
    await writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify({ ...manifest, signature: signature(manifest) }, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    return folder;
  } finally {
    await db.end();
  }
}
export async function restoreBackup(bundle: string, target?: string) {
  guard();
  const m = await load(bundle);
  const name =
    target ||
    `${site.local.databaseName}_restore_${Date.now()}_${randomBytes(2).toString("hex")}`;
  if (
    name.length > 63 ||
    !name.startsWith(site.local.databaseName + "_restore_") ||
    !/^[a-z][a-z0-9_]+$/.test(name) ||
    name === site.local.databaseName
  )
    throw Error(
      "Restore target must be a NEW isolated site_restore_* database",
    );
  const adminUrl = new URL(url);
  adminUrl.username = "postgres";
  adminUrl.password = process.env.LOCAL_POSTGRES_ADMIN_PASSWORD || "";
  adminUrl.pathname = "/postgres";
  const admin = dbFor(adminUrl);
  let created = false;
  const folder = path.join(root, ".local/restores", name);
  await mkdir(folder, { recursive: true });
  try {
    const [exists] =
      await admin`select 1 from pg_database where datname=${name}`;
    if (exists)
      throw Error("Restore refuses an existing database; nothing overwritten");
    await admin.unsafe(
      `CREATE DATABASE "${name}" OWNER "${site.local.databaseUser}"`,
    );
    created = true;
  } finally {
    await admin.end();
  }
  const targetUrl = new URL(url);
  targetUrl.pathname = "/" + name;
  const pg = command(
      "pg_restore",
      [
        "--dbname",
        name,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--single-transaction",
      ],
      targetUrl,
    );
  const de = decrypt(
      bundle,
      m.entries.find((e: Entry) => e.file === "database.enc"),
    );
  await Promise.all([pipeline(de.input, de.decrypt, pg.child.stdin), pg.done]);
  const db = dbFor(targetUrl);
  try {
    const digest = await digestDb(db);
    if (JSON.stringify(digest) !== JSON.stringify(m.digest))
      throw Error(
        "Restored database differs from authenticated source snapshot",
      );
    const files = path.join(folder, "assets");
    await mkdir(files, { recursive: true });
    for (const e of m.entries as Entry[]) {
      if (!e.taskId) continue;
      if (!/^[0-9a-f-]{36}$/.test(e.taskId))
        throw Error("Invalid backup asset id");
      const stream = decrypt(bundle, e);
      const file = path.join(files, `${e.taskId}.mp4`);
      await pipeline(
        stream.input,
        stream.decrypt,
        createWriteStream(file, { flags: "wx", mode: 0o600 }),
      );
      if ((await digestFile(file)) !== e.plainSha256)
        throw Error("Restored file hash mismatch");
    }
    for (const e of m.entries as Entry[]) {
      if (!e.uploadId) continue;
      if (
        !e.localKey ||
        !/^uploads\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(e.localKey) ||
        !e.localKey.startsWith(`uploads/${e.uploadId}.`)
      )
        throw Error("Invalid upload recovery key");
      const stream = decrypt(bundle, e);
      const file = path.join(files, e.localKey);
      await mkdir(path.dirname(file), { recursive: true });
      await pipeline(
        stream.input,
        stream.decrypt,
        createWriteStream(file, { flags: "wx", mode: 0o600 }),
      );
      if ((await digestFile(file)) !== e.plainSha256)
        throw Error("Restored upload mismatch");
      await db`update private_uploads set storage_backend='local',storage_scope=null,storage_key=${e.localKey} where id=${e.uploadId}`;
    }
    // Portable offline recovery copies remote files into a private local root.
    // Money/task identity is preserved; only the explicit storage routing changes.
    await db`update task_assets set storage_backend='local',storage_scope=null,storage_key=task_id||'.mp4'`;
    await db`update worker_heartbeats set status='STOPPED'`;
    const result = {
      database: name,
      assetDirectory: files,
      siteId: site.id,
      sourceDigestVerified: true,
      filesVerified: m.entries.filter((e: Entry) => !!e.taskId || !!e.uploadId)
        .length,
      workersStarted: false,
      financialDataUnchanged: true,
      storageRouting: "portable-local",
      requiresOriginalSecrets: true,
    };
    await writeFile(
      path.join(folder, "RESTORE-VERIFIED.json"),
      JSON.stringify(result, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    await writeFile(
      path.join(folder, "site.json"),
      JSON.stringify(m.site, null, 2),
      { flag: "wx" },
    );
    return result;
  } finally {
    await db.end();
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/backup-site.ts")) {
  const [cmd, bundle, target] = process.argv.slice(2);
  (async () => {
    if (cmd === "create")
      console.log(JSON.stringify({ backup: await createBackup() }));
    else if (cmd === "restore" && bundle)
      console.log(
        JSON.stringify(await restoreBackup(path.resolve(bundle), target)),
      );
    else if (cmd === "verify" && bundle) {
      await load(path.resolve(bundle));
      console.log("Backup manifest and encrypted payloads verified");
    } else
      throw Error(
        "Usage: backup-site.ts create | verify <bundle> | restore <bundle> [NEW site_restore_* database]",
      );
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
