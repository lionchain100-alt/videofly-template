import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
// Individual suites guard the dedicated local DB and managed workers, and clean
// their isolated fixtures. The admin API suite additionally needs localhost:3000.
const suites = [
  "test-admin-dashboard.ts",
  "test-text-tasks.ts",
  "test-video-jobs.mjs",
  "test-payment-orders.ts",
  "test-refunds.ts",
  "test-billing-unification.ts",
  "test-four-channel-refunds.ts",
  "test-payment-operations.ts",
  "test-admin-operations.mjs",
  "test-ai-governance.ts",
];
for (const name of suites) {
  console.log(`Retained regression: ${name}`);
  execFileSync(process.execPath, ["--import", "tsx", `scripts/${name}`], {
    cwd,
    stdio: "inherit",
    env: {...process.env,ASSET_STORAGE_BACKEND:"local"},
  });
}
console.log(
  "All retained integration/API suites passed. Browser and production isolation checks remain separate gates.",
);
