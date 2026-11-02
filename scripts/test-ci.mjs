import { spawn, execFileSync } from "node:child_process";
import { open } from "node:fs/promises";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" || process.platform === "win32")
  throw Error("Use the isolated Linux GitHub Actions runner; local retained tests have separate commands");
const log = await open(".local/ci-web.log", "w");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "::", "--port", "3000"], {
  detached: true, stdio: ["ignore", log.fd, log.fd], env: { ...process.env, NODE_ENV: "development" },
});
let spawnError;
child.on("error", e => { spawnError = e; });
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (spawnError || child.exitCode !== null) throw Error("CI web server exited before readiness");
    try {
      if ((await fetch("http://localhost:3000/api/health", { signal: AbortSignal.timeout(5000) })).ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw Error("CI web server did not become live");
  execFileSync(process.execPath, ["scripts/test-retained-capabilities.mjs"], { stdio: "inherit" });
  execFileSync(process.execPath, ["--import", "tsx", "scripts/test-presentation-policy.ts"], { stdio: "inherit" });
} finally {
  if (child.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
  await log.close();
}
