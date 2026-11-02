import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";

const parseSslConfig = (url: string) => {
  const mode = (
    process.env.DATABASE_SSL_MODE ||
    process.env.DATABASE_SSL ||
    ""
  )
    .toLowerCase()
    .trim();

  if (mode === "disable" || mode === "false" || mode === "0" || mode === "off") {
    return undefined;
  }

  if (mode === "require" || mode === "true" || mode === "1" || mode === "on") {
    return "require" as const;
  }

  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
  return isLocalhost ? undefined : ("require" as const);
};

function createDb() {
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
    throw new Error(
      "Missing or invalid DATABASE_URL. Set a valid PostgreSQL connection string in your .env file.\n" +
        "Example: DATABASE_URL='postgresql://user:password@host:port/database'"
    );
  }
  const sql = postgres(databaseUrl, {
    max: process.env.NODE_ENV === "development" ? 5 : 10,
    ssl: parseSslConfig(databaseUrl),
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { TimeZone: "UTC" },
  });
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;
const shared = globalThis as typeof globalThis & {
  __laconicDatabase?: { url: string; value: ReturnType<typeof createDb> };
};
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    if (!_db) {
      if (shared.__laconicDatabase?.url === databaseUrl) {
        _db = shared.__laconicDatabase.value;
      } else {
        if (shared.__laconicDatabase) void shared.__laconicDatabase.value.$client.end({ timeout: 2 }).catch(() => {});
        _db = createDb();
        shared.__laconicDatabase = { url: databaseUrl, value: _db };
      }
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export * from "./schema";
