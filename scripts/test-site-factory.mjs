import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
const sites = path.resolve(root, "../sites");
const id = `qa-factory-${randomBytes(5).toString("hex")}`;
const target = path.join(sites, id);
assert(path.dirname(target) === sites && path.basename(target).startsWith("qa-factory-"));
try {
  execFileSync(process.execPath, ["scripts/create-local-site.mjs", id, "3099", "55599"], { cwd: root, stdio: "pipe" });
  // Next's [...all] route is a valid path segment, not a traversal component.
  assert.equal(await readFile(path.join(target, "src/app/api/auth/[...all]/route.ts"), "utf8"), await readFile(path.join(root, "src/app/api/auth/[...all]/route.ts"), "utf8"));
  const original = parse(await readFile(path.join(root, ".env.local"), "utf8"));
  const generatedText = await readFile(path.join(target, ".env.local"), "utf8");
  const generated = parse(generatedText);
  const mapping = JSON.parse(await readFile(path.join(target, ".project-state.json"), "utf8"));
  assert.equal(mapping.roles.status, "docs/project-state/INSTANCE-STATUS.md");
  assert((await readFile(path.join(target, mapping.roles.status), "utf8")).includes(id));
  for (const key of ["BETTER_AUTH_SECRET", "DATABASE_URL", "BACKUP_ENCRYPTION_KEY", "LOCAL_ADMIN_PASSWORD"])
    assert.notEqual(generated[key], original[key]);
  for (const key of ["TEXT_AI_API_KEY", "KIE_API_KEY", "PAYPAL_CLIENT_SECRET", "WAFFO_PRIVATE_KEY", "STRIPE_API_KEY", "CREEM_API_KEY", "ASSET_S3_SECRET_ACCESS_KEY"])
    assert(!generated[key], key);
  assert.equal(spawnSync(process.execPath, ["scripts/create-local-site.mjs", id, "3098", "55598"], { cwd: root }).status, 1);
  assert.equal(await readFile(path.join(target, ".env.local"), "utf8"), generatedText);
  console.log("PASS factory copies catch-all auth route, generates independent secrets, excludes provider keys and rejects existing destination without overwriting");
} finally { await rm(target, { recursive: true, force: true }); }
