import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = path.resolve(root, ".local");
await mkdir(local, { recursive: true });
const directory = await mkdtemp(path.join(local, "release-gates-probe-"));
assert(path.resolve(directory).startsWith(local + path.sep) && path.basename(directory).startsWith("release-gates-probe-"), "Unexpected temporary cleanup target");
const run = (args, cwd, env = {}) => spawnSync(process.execPath, args, {
  cwd, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024,
});
const lintProbe = path.join(root, "src/aud009-lint-probe.ts");
try {
  await mkdir(path.join(directory, "src/config"), { recursive: true });
  const site = JSON.parse(await readFile(path.join(root, "src/config/site.json"), "utf8"));
  site.origin = "https://independent.owner-domain.dev";
  await writeFile(path.join(directory, "src/config/site.json"), JSON.stringify(site));
  const bootstrap = path.join(root, "scripts/prepare-ci.mjs");
  assert.notEqual(run([bootstrap, "--build-only"], directory, { CI: "false", GITHUB_ACTIONS: "false" }).status, 0);
  const isolated = { CI: "true", GITHUB_ACTIONS: "true" };
  assert.equal(run([bootstrap, "--build-only"], directory, isolated).status, 0);
  const envPath = path.join(directory, ".env.local");
  const first = await readFile(envPath, "utf8");
  assert(first.includes(site.origin));
  assert(!first.includes("DATABASE_URL"));
  assert.notEqual(run([bootstrap, "--build-only"], directory, isolated).status, 0);
  assert.equal(await readFile(envPath, "utf8"), first);
  assert.equal(JSON.parse(await readFile(path.join(directory, "src/config/site.json"), "utf8")).origin, site.origin);
  const lint = path.join(root, "scripts/lint-gate.mjs");
  assert.equal(run([lint], root).status, 0);
  await writeFile(lintProbe, "export const broken = ;\n", { flag: "wx" });
  const rejected = run([lint], root);
  assert.notEqual(rejected.status, 0);
  assert(rejected.stderr.includes("aud009-lint-probe.ts"));
  await unlink(lintProbe);
  console.log("PASS CI environment isolation, non-overwrite guard, original-site build identity and lint new-parser-error rejection; no database/provider calls");
} finally {
  await unlink(lintProbe).catch(e => { if (e.code !== "ENOENT") throw e; });
  await rm(directory, { recursive: true });
}
