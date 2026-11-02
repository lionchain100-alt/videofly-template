import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, [
  "node_modules/@biomejs/biome/bin/biome", "lint", "src", "scripts",
  "--reporter=json", "--max-diagnostics=100000",
], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (result.error || result.signal || ![0, 1].includes(result.status))
  throw Error("Biome could not complete the full source scan");
const report = JSON.parse(result.stdout);
if (report.summary.diagnosticsNotPrinted || !report.summary.unchanged)
  throw Error("Incomplete lint report");
const baseline = JSON.parse(readFileSync(new URL("../docs/quality/lint-baseline.json", import.meta.url), "utf8"));
const configHash = createHash("sha256").update(readFileSync(new URL("../biome.json", import.meta.url), "utf8").replaceAll("\r\n", "\n")).digest("hex");
if (baseline.configSha256 !== configHash) throw Error("Lint policy changed; review scope/rules and baseline together");
const remaining = new Map(baseline.entries.map(e => [e.fingerprint, e.count]));
let accepted = 0;
const added = [];
for (const d of report.diagnostics) {
  const filename = path.relative(root, path.resolve(root, d.location.path.file)).replaceAll("\\", "/");
  const snippet = Buffer.from(d.location.sourceCode || "").subarray(...(d.location.span || [0, 0])).toString().replaceAll("\r\n", "\n");
  const fingerprint = createHash("sha256").update(JSON.stringify([filename, d.category, d.description, snippet])).digest("hex");
  const count = remaining.get(fingerprint) || 0;
  if (d.category.startsWith("lint/") && count > 0) {
    remaining.set(fingerprint, count - 1);
    accepted++;
  } else added.push(`${filename}: ${d.category}: ${d.description}`);
}
if (added.length) {
  console.error(added.join("\n"));
  throw Error(`${added.length} new lint/parser/configuration diagnostics; historical baseline is not auto-updated`);
}
console.log(`LINT_GATE_OK: ${report.summary.unchanged} files scanned, ${accepted} known diagnostics, no new diagnostics. Scope/exclusions: docs/quality/README.md`);
