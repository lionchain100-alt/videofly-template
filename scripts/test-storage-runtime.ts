import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  unlink,
  mkdir,
  utimes,
  access as fsAccess,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import net from "node:net";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  const q = postgres(url.href, { ssl: false, max: 2, onnotice: () => {} });
  const owner = randomUUID();
  const task = randomUUID();
  const checks: string[] = [];
  const objects = new Map<string, Buffer>();
  const listening = await new Promise<boolean>((r) => {
    const s = net.connect({ host: "127.0.0.1", port: 3000 });
    s.once("connect", () => {
      s.destroy();
      r(true);
    });
    s.once("error", () => r(false));
  });
  if (listening) {
    await q.end();
    throw Error(
      "Stop main Web/Workers before offline storage recovery fixtures",
    );
  }
  const [active] =
    await q`select count(*)::int as n from worker_heartbeats where status='RUNNING' and heartbeat_at>now()-interval '30 seconds'`;
  if (active.n) {
    await q.end();
    throw Error("Stop Workers before fixtures");
  }
  const originalEnv = { ...process.env };
  const access = "AUD006_FIXTURE_ACCESS";
  const secret = "AUD006_FIXTURE_SECRET";
  let failPut = false;
  let deny = false;
  let puts = 0;
  const hash = (x: any) => createHash("sha256").update(x).digest("hex");
  const hmac = (k: any, x: string) => createHmac("sha256", k).update(x).digest();
  const server = createServer(async (req, res) => {
    try {
      if (deny) {
        res.writeHead(503).end();
        return;
      }
      const u = new URL(req.url!, "http://" + req.headers.host);
      const auth = String(req.headers.authorization || "");
      const m =
          /Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]+)/.exec(
            auth,
          );
      if (!m || m[1] !== access) {
        res.writeHead(403).end();
        return;
      }
      const [date, region, service, last] = m[2].split("/");
      assert.equal(service, "s3");
      assert.equal(last, "aws4_request");
      const canonical = [
        req.method,
        u.pathname,
        [...u.searchParams]
          .sort()
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&"),
        m[3]
          .split(";")
          .map((k) => `${k}:${String(req.headers[k]).trim()}\n`)
          .join(""),
        m[3],
        "UNSIGNED-PAYLOAD",
      ].join("\n");
      const signing = hmac(
        hmac(hmac(hmac("AWS4" + secret, date), region), "s3"),
        "aws4_request",
      );
      assert.equal(
        m[4],
        hmac(
          signing,
          [
            "AWS4-HMAC-SHA256",
            String(req.headers["x-amz-date"]),
            m[2],
            hash(canonical),
          ].join("\n"),
        ).toString("hex"),
      );
      const key = decodeURIComponent(u.pathname);
      if (key === "/private-fixture" && req.method === "HEAD") {
        res.writeHead(200).end();
        return;
      }
      if (req.method === "PUT") {
        if (failPut) {
          res.writeHead(503).end();
          return;
        }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        objects.set(key, Buffer.concat(chunks));
        puts++;
        res.writeHead(200, { etag: "fixture" }).end();
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
        return;
      }
      const b = objects.get(key);
      if (!b) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Length": b.length }).end();
        return;
      }
      const r = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range || ""));
      if (r) {
        const start = Number(r[1]);
        const end = Number(r[2]);
        res
          .writeHead(206, {
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${b.length}`,
          })
          .end(b.subarray(start, end + 1));
      } else res.writeHead(200, { "Content-Length": b.length }).end(b);
    } catch {
      res.writeHead(403).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as any;
  Object.assign(process.env, {
    ASSET_STORAGE_BACKEND: "s3",
    ASSET_S3_ALLOW_LOCAL_TEST: "true",
    ASSET_S3_ENDPOINT: `http://127.0.0.1:${address.port}`,
    ASSET_S3_BUCKET: "private-fixture",
    ASSET_S3_ACCESS_KEY_ID: access,
    ASSET_S3_SECRET_ACCESS_KEY: secret,
  });
  const { db } = await import("../src/db");
  const { privateS3Config, putPrivateFile, objectHash, privateObject } =
      await import("../src/services/private-storage");
  const { assetPath, storedAssetSize, storedAssetBody } = await import(
      "../src/services/video-assets"
    );
  const { saveUpload, uploadBody } = await import(
      "../src/services/private-uploads"
    );
  const { startHeartbeat, runtimeHealth } = await import(
      "../src/services/runtime-health"
    );
  let upload: any;
  const beats: any[] = [];
  let bundle = "";
  try {
    await q`insert into "user" (id,name,email,"emailVerified") values (${owner},'Storage isolated fixture',${`storage-${owner}@example.invalid`},true)`;
    const media = await readFile("scripts/fixtures/blue-1s.mp4");
    await mkdir(path.dirname(assetPath(task)), { recursive: true });
    await writeFile(assetPath(task), media, { flag: "wx" });
    const meta = await putPrivateFile(task, assetPath(task), hash(media));
    const before = puts;
    await putPrivateFile(task, assetPath(task), hash(media));
    assert.equal(puts, before);
    await assert.rejects(putPrivateFile(task, assetPath(task), "0".repeat(64)));
    checks.push(
      "SigV4 verified; upload readback; retry reuses matching object; mismatched overwrite refused",
    );
    assert.deepEqual(await objectHash(meta.storageKey), {
      sha256: hash(media),
      size: media.length,
    });
    const a = { ...meta, taskId: task, byteLength: media.length };
    assert.equal(await storedAssetSize(a), media.length);
    assert.deepEqual(
      Buffer.from(
        await new Response(await storedAssetBody(a, 2, 18)).arrayBuffer(),
      ),
      media.subarray(2, 19),
    );
    await assert.rejects(storedAssetSize({ ...a, storageScope: "foreign" }));
    await assert.rejects(
      storedAssetSize({ ...a, storageKey: "foreign/private/x" }),
    );
    await assert.rejects(privateObject("../outside"));
    for (let code = 0; code < 32; code++)
      await assert.rejects(privateObject(`${meta.storageKey}${String.fromCharCode(code)}`), /Asset namespace mismatch/);
    for (const character of ["\\", "?", "#"])
      await assert.rejects(privateObject(`${meta.storageKey}${character}`), /Asset namespace mismatch/);
    checks.push("private Range; bucket scope and namespace denied");
    failPut = true;
    await assert.rejects(
      putPrivateFile(randomUUID(), assetPath(task), hash(media)),
    );
    failPut = false;
    checks.push("failed object PUT refuses success");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=",
      "base64",
    );
    upload = await saveUpload(
      owner,
      new File([png], "pixel.png", { type: "image/png" }),
    );
    const [row] =
      await q`select id,storage_backend as "storageBackend",storage_scope as "storageScope",storage_key as "storageKey",mime,byte_length as "byteLength" from private_uploads where id=${upload.id}`;
    assert.deepEqual(
      Buffer.from(await (await uploadBody(row as any)).arrayBuffer()),
      png,
    );
    await assert.rejects(
      saveUpload(
        owner,
        new File([Buffer.from("fake image content")], "bad.png", {
          type: "image/png",
        }),
      ),
    );
    checks.push("private image persisted/readback; MIME mismatch refused");
    await q`insert into tasks (id,user_id,request_id,input_hash,tool_id,status,input,provider,model,execution_config,credits,queue_deadline) values (${task},${owner},${randomUUID()},${hash(media)},'video-generation','SUCCEEDED','{}','fixture','fixture','{}',1,now())`;
    await q`insert into task_assets (task_id,user_id,storage_key,storage_backend,storage_scope,mime,byte_length,sha256) values (${task},${owner},${meta.storageKey},'s3',${meta.storageScope},'video/mp4',${media.length},${hash(media)})`;
    const h0 = await runtimeHealth(true);
    assert.equal(h0.checks.workers, false);
    for (const kind of ["text", "video", "payments"] as const)
      beats.push(await startHeartbeat(kind));
    assert.equal((await runtimeHealth(true)).ready, true);
    const manifestFile = "src/config/site.json";
    const manifestBytes = await readFile(manifestFile);
    await beats[1].stop();
    try {
      const manifest = JSON.parse(manifestBytes.toString());
      manifest.tools["video-generation"] = false;
      await writeFile(manifestFile, JSON.stringify(manifest));
      assert.equal((await runtimeHealth(true)).ready, true);
    } finally {
      await writeFile(manifestFile, manifestBytes);
    }
    assert.equal((await runtimeHealth(true)).ready, false);
    beats.push(await startHeartbeat("video"));
    checks.push(
      "disabled tool does not require its Worker; re-enabling requires a fresh instance",
    );
    await q`update worker_heartbeats set heartbeat_at=now()-interval '40 seconds' where instance_id in ${q(beats.map((b) => b.instanceId))}`;
    assert.equal((await runtimeHealth(true)).ready, false);
    for (const b of beats) await b.progress();
    assert.equal((await runtimeHealth(true)).ready, true);
    await q`update worker_heartbeats set progress_at=now()-interval '6 minutes' where instance_id in ${q(beats.map((b) => b.instanceId))}`;
    assert.equal((await runtimeHealth(true)).checks.workers, false);
    for (const b of beats) await b.progress();
    deny = true;
    assert.equal((await runtimeHealth(true)).checks.storage, false);
    deny = false;
    for (const b of beats) await b.stop();
    assert.equal((await runtimeHealth(true)).checks.workers, false);
    checks.push(
      "heartbeat fresh/stale/stalled/stopped; storage failure never ready",
    );
    const temporary = path.join(
      path.dirname(assetPath(task)),
      `${randomUUID()}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, "stale-download");
      await utimes(
        temporary,
        new Date(Date.now() - 7200000),
        new Date(Date.now() - 7200000),
      );
      const dry = JSON.parse(
        execFileSync(
          process.execPath,
          ["--import", "tsx", "scripts/storage-maintenance.ts"],
          { encoding: "utf8" },
        ),
      );
      assert(dry.actions.some((a: any) => a.name === path.basename(temporary)));
      await fsAccess(temporary);
      execFileSync(process.execPath, [
        "--import",
        "tsx",
        "scripts/storage-maintenance.ts",
        "--apply",
      ]);
      await assert.rejects(fsAccess(temporary));
      await fsAccess(assetPath(task));
      checks.push(
        "maintenance dry-run preserves files; apply deletes only stale temporary file and retains registered video",
      );
    } finally {
      await unlink(temporary).catch(() => {});
    }
    const { createBackup, restoreBackup } = await import("./backup-site");
    bundle = await createBackup();
    const target = `laconic_local_restore_qa_${Date.now()}`;
    const restored = await restoreBackup(bundle, target);
    assert.equal(restored.sourceDigestVerified, true);
    assert.equal(restored.financialDataUnchanged, true);
    assert(restored.filesVerified >= 3);
    assert.deepEqual(
      await readFile(path.join(restored.assetDirectory, `${task}.mp4`)),
      media,
    );
    assert.deepEqual(
      await readFile(
        path.join(restored.assetDirectory, `uploads/${upload.id}.png`),
      ),
      png,
    );
    await assert.rejects(restoreBackup(bundle, "laconic_local"));
    await assert.rejects(restoreBackup(bundle, target));
    checks.push(
      "encrypted database + legacy local/video S3/private upload restored into independent database; full table fingerprints and file hashes verified; main/existing targets refused",
    );
    const key = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_KEY = "0".repeat(64);
    await assert.rejects(
      restoreBackup(bundle, `laconic_local_restore_wrong_${Date.now()}`),
    );
    process.env.BACKUP_ENCRYPTION_KEY = key;
    const mf = path.join(bundle, "manifest.json");
    const original = await readFile(mf);
    try {
      const m = JSON.parse(original.toString());
      m.site.id = "foreign-site";
      await writeFile(mf, JSON.stringify(m));
      await assert.rejects(
        restoreBackup(bundle, `laconic_local_restore_tamper_${Date.now()}`),
      );
    } finally {
      await writeFile(mf, original);
    }
    const manifest = JSON.parse(original.toString());
    const payload = path.join(bundle, manifest.entries[0].file);
    const cipher = await readFile(payload);
    try {
      const corrupted = Buffer.from(cipher);
      corrupted[0] ^= 1;
      await writeFile(payload, corrupted);
      await assert.rejects(
        restoreBackup(bundle, `laconic_local_restore_corrupt_${Date.now()}`),
      );
    } finally {
      await writeFile(payload, cipher);
    }
    checks.push(
      "wrong encryption key, altered manifest and corrupt ciphertext rejected before restore",
    );
    await writeFile(
      "docs/project-state/aud-006-storage-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          checks,
          backup: path.relative(process.cwd(), bundle),
          restoreDatabase: target,
          realProviderCalls: 0,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(checks.map((x) => "PASS " + x).join("\n"));
  } finally {
    for (const b of beats) await b.stop();
    if (beats.length)
      await q`delete from worker_heartbeats where instance_id in ${q(beats.map((b) => b.instanceId))}`;
    await q`delete from task_assets where task_id=${task}`;
    await q`delete from tasks where id=${task}`;
    await q`delete from private_uploads where user_id=${owner}`;
    await q`delete from "user" where id=${owner}`;
    await unlink(assetPath(task)).catch(() => {});
    await q.end();
    await db.$client.end({ timeout: 5 });
    await new Promise<void>((r) => server.close(() => r()));
    for (const k of Object.keys(process.env))
      if (!(k in originalEnv)) delete process.env[k];
    Object.assign(process.env, originalEnv);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
