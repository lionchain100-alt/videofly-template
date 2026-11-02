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
if (baseline.totalDiagnostics !== 0 || baseline.entries.length !== 0)
  throw Error("Historical lint waivers are retired; the source gate requires zero diagnostics");
const configHash = createHash("sha256").update(readFileSync(new URL("../biome.json", import.meta.url), "utf8").replaceAll("\r\n", "\n")).digest("hex");
if (baseline.configSha256 !== configHash) throw Error("Lint policy changed; review scope/rules and baseline together");
const added = [];
for (const d of report.diagnostics) {
  const filename = path.relative(root, path.resolve(root, d.location.path.file)).replaceAll("\\", "/");
  added.push(`${filename}: ${d.category}: ${d.description}`);
}
if (added.length) {
  console.error(added.join("\n"));
  throw Error(`${added.length} lint/parser/configuration diagnostics; zero diagnostics required`);
}
if (result.status !== 0) throw Error("Biome returned a failure without diagnostics");
console.log(`LINT_GATE_OK: ${report.summary.unchanged} files scanned, zero diagnostics and no historical waivers. Scope/exclusions: docs/quality/README.md`);
