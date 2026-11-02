import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { checkProductionConfiguration } from "../src/config/production-check";

const args = process.argv.slice(2);
const allowed = new Set(["--env-file", "--site-file", "--report-only"]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw Error("Use --env-file PATH --site-file PATH [--report-only]");
  if (args[i] !== "--report-only" && !args[++i]) throw Error("Missing configuration path");
}
const option = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
config({ path: option("--env-file", ".env.local"), quiet: true });
const site = JSON.parse(readFileSync(option("--site-file", "src/config/site.json"), "utf8"));
const report = checkProductionConfiguration(site, process.env);
console.log(JSON.stringify(report, null, 2));
if (!report.passed && !args.includes("--report-only")) process.exitCode = 1;
