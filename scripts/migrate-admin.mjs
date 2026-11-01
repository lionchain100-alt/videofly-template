import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const url = new URL(process.env.DATABASE_URL || "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/laconic_local")
  throw new Error("This migration helper is restricted to the dedicated local test database.");
const directory = new URL("../src/db/migrations/", import.meta.url);
const names = (await readdir(directory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const db = postgres(url.toString(), { ssl: false, max: 1, onnotice: () => {} });
try {
  for (const name of names) {
    const migration = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    await db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(664302)`;
      await tx`create table if not exists project_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
      const [existing] = await tx`select checksum from project_migrations where name=${name}`;
      if (existing) {
        if (existing.checksum !== checksum) throw new Error("Applied migration checksum mismatch.");
        console.log(`${name}: already applied.`);
        return;
      }
      await tx.unsafe(migration);
      await tx`insert into project_migrations (name, checksum) values (${name},${checksum})`;
      console.log(`${name}: applied (additive schema, existing data retained).`);
    });
  }
} finally {
  await db.end();
}
