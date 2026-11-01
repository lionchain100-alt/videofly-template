import { localDatabaseUrl } from "./local-site.mjs";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

config({
  path: fileURLToPath(new URL("../.env.local", import.meta.url)),
  quiet: true,
});
const url = localDatabaseUrl();
const directory = new URL("../src/db/migrations/", import.meta.url);
const names = (await readdir(directory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const db = postgres(url.toString(), { ssl: false, max: 1, onnotice: () => {} });
try {
  await db.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(664302)`;
    const [count] =
      await tx`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`;
    if (count.n === 0) {
      await tx.unsafe(
        await readFile(
          new URL("../src/db/baseline.sql", import.meta.url),
          "utf8",
        ),
      );
      console.log(
        "Empty database initialized from original template baseline.",
      );
    }
  });
  for (const name of names) {
    const migration = await readFile(new URL(name, directory), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    await db.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(664302)`;
      await tx`create table if not exists project_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
      const [existing] =
        await tx`select checksum from project_migrations where name=${name}`;
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error("Applied migration checksum mismatch.");
        console.log(`${name}: already applied.`);
        return;
      }
      await tx.unsafe(migration);
      await tx`insert into project_migrations (name, checksum) values (${name},${checksum})`;
      console.log(
        `${name}: applied (additive schema, existing data retained).`,
      );
    });
  }
} finally {
  await db.end();
}
