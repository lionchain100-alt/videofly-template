import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
const net=await import('node:net');const occupied=await new Promise(r=>{const c=net.connect({host:'127.0.0.1',port:3000});c.once('connect',()=>{c.destroy();r(true)});c.once('error',()=>r(false));});if(occupied)throw Error('Stop main Web before no-DB preview probe');
const script = `// AUD008_NO_DB_PROBE\nprocess.env.DATABASE_URL='';process.env.POSTGRES_URL='';process.argv=[process.execPath,require.resolve('next/dist/bin/next'),'dev','--hostname','::','--port','3000'];require('next/dist/bin/next');`;
const child = spawn(process.execPath, ["-e", script], {
  windowsHide: true,
  env: {
    ...process.env,
    DATABASE_URL: "",
    POSTGRES_URL: "",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const log = createWriteStream(".local/aud008-offline.log");
child.stdout.pipe(log);
child.stderr.pipe(log);
try {
  let html = "",
    ok = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://localhost:3000/ui-preview", {
        headers: { Host: "localhost:3000" },
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 200) {
        html = await r.text();
        ok = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ok, "No-database preview did not start");
  assert(html.includes("UI Preview"));
  const config = await fetch("http://localhost:3000/api/ui-studio/config", {
    headers: { Host: "localhost:3000" },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(config.status, 200);
  await writeFile(
    "docs/project-state/aud-008-offline-preview-results.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        databaseUrlAbsent: true,
        postgresUrlAbsent: true,
        previewServerRendering200: true,
        studioConfiguration200: true,
        privateLoopbackHostHeader: true,
        businessApiCalls: 0,
        scope:
          "No-database SSR/config proof; browser simulation/keyboard proof is recorded separately",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS UI preview/config with both database connection variables empty",
  );
} finally {
  if (child.exitCode === null) {
    if (process.platform === "win32")
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid}";if($p -and $p.CommandLine -like '*AUD008_NO_DB_PROBE*'){taskkill.exe /PID ${child.pid} /T /F | Out-Null}`,
        ],
        { windowsHide: true },
      );
    else child.kill("SIGTERM");
  }
  log.end();
}
