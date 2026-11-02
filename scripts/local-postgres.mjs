import { localDatabaseUrl, site } from "./local-site.mjs";
import { existsSync } from "node:fs";
import { mkdir, writeFile, unlink, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: path.join(root, ".env.local"), quiet: true });
const nativeRoot = path.join(
  process.env.LOCALAPPDATA,
  site.local.nativeWorkspace,
);
const databaseDir = path.join(nativeRoot, ".local/postgres/data");
const command = process.argv[2] || "start";
const databaseUrl = localDatabaseUrl();
async function runNative(name, args) {
  if (
    (await realpath(nativeRoot)).toLowerCase() !==
    (await realpath(root)).toLowerCase()
  )
    throw new Error(
      "Native workspace junction does not point to this project.",
    );
  const require = createRequire(import.meta.url);
  const embeddedRequire = createRequire(require.resolve("embedded-postgres"));
  const binaries = await import(
    pathToFileURL(embeddedRequire.resolve("@embedded-postgres/windows-x64"))
      .href
  );
  const executable = binaries[name].replace(root, `${nativeRoot}${path.sep}`);
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => process.stdout.write(data));
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("error", reject);
    child.on("exit", (code) => {
      child.stdout.destroy();
      child.stderr.destroy();
      code === 0
        ? resolve()
        : reject(new Error(`${name} exited with code ${code}`));
    });
  });
}
if (command === "status") {
  const sql = postgres(databaseUrl.toString(), {
    max: 1,
    connect_timeout: 2,
    ssl: false,
  });
  try {
    await sql`select 1`;
    console.log("Local PostgreSQL is ready.");
  } catch {
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 1 });
  }
} else if (command === "stop") {
  await runNative("pg_ctl", ["stop", "-D", databaseDir, "-m", "fast", "-w"]);
  console.log("Local PostgreSQL stopped; persistent data retained.");
} else if (command === "start") {
  if (!process.env.LOCAL_POSTGRES_ADMIN_PASSWORD)
    throw new Error("Run scripts/prepare-local-env.mjs first.");
  const nativeState = path.join(nativeRoot, ".local/postgres");
  await mkdir(nativeState, { recursive: true });
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    const passwordFile = path.join(nativeState, "init-password");
    try {
      await writeFile(
        passwordFile,
        `${process.env.LOCAL_POSTGRES_ADMIN_PASSWORD}\n`,
        { mode: 0o600 },
      );
      await runNative("initdb", [
        "-D",
        databaseDir,
        "--auth=scram-sha-256",
        "--username=postgres",
        `--pwfile=${passwordFile}`,
        "--encoding=UTF8",
        "--locale=C",
      ]);
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
  }
  await runNative("pg_ctl", [
    "start",
    "-D",
    databaseDir,
    "-l",
    path.join(nativeState, "server.log"),
    "-o",
    `-h 127.0.0.1 -p ${site.local.databasePort}`,
    "-w",
    "-t",
    "20",
  ]);
  const admin = postgres({
    host: "127.0.0.1",
    port: site.local.databasePort,
    user: "postgres",
    password: process.env.LOCAL_POSTGRES_ADMIN_PASSWORD,
    database: "postgres",
    ssl: false,
    max: 1,
  });
  try {
    if (
      !(
        await admin`select 1 from pg_roles where rolname = ${site.local.databaseUser}`
      ).length
    )
      await admin.unsafe(
        `CREATE ROLE "${site.local.databaseUser}" LOGIN PASSWORD '${process.env.LOCAL_DATABASE_PASSWORD.replaceAll("'", "''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
    if (
      !(
        await admin`select 1 from pg_database where datname = ${site.local.databaseName}`
      ).length
    )
      await admin.unsafe(
        `CREATE DATABASE "${site.local.databaseName}" OWNER "${site.local.databaseUser}"`,
      );
  } finally {
    await admin.end();
  }
  console.log(
    `LOCAL_DATABASE_READY 127.0.0.1:${site.local.databasePort}/${site.local.databaseName}`,
  );
} else throw new Error("Use start, status or stop.");
