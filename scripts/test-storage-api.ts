import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import postgres from "postgres";
import { privateS3, putPrivateFile } from "../src/services/private-storage";
import { assetPath } from "../src/services/video-assets";
async function main() {
  const u = new URL(process.env.DATABASE_URL!);
  assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "55432");
  assert.equal(u.pathname, "/laconic_local");
  assert.equal(
    process.env.ASSET_STORAGE_BACKEND,
    "s3",
    "Explicitly configured private test bucket required",
  );
  const db = postgres(u.href, { ssl: false, max: 2, onnotice: () => {} });
  const base = "http://localhost:3000";
  const task = randomUUID();
  const checks: string[] = [];
  const uploads: string[] = [];
  let key = "";
  async function login(email: string, password: string) {
    const r = await fetch(base + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(r.status, 200);
    return r.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
  }
  const admin = await login(
      process.env.LOCAL_ADMIN_EMAIL!,
      process.env.LOCAL_ADMIN_PASSWORD!,
    );
  const member = await login(
      "member@laconic.local",
      process.env.LOCAL_MEMBER_PASSWORD!,
    );
  const [owner] =
    await db`select id from "user" where email=${process.env.LOCAL_ADMIN_EMAIL!}`;
  async function request(route: string, cookie = "", init: RequestInit = {}) {
    return fetch(base + route, {
      ...init,
      headers: { Cookie: cookie, ...init.headers },
      redirect: "manual",
    });
  }
  try {
    const media = await readFile("scripts/fixtures/blue-1s.mp4");
    await writeFile(assetPath(task), media, { flag: "wx" });
    const meta = await putPrivateFile(
      task,
      assetPath(task),
      createHash("sha256").update(media).digest("hex"),
    );
    key = meta.storageKey;
    await db`insert into tasks(id,user_id,request_id,input_hash,tool_id,status,input,provider,model,execution_config,credits,queue_deadline)values(${task},${owner.id},${randomUUID()},'storage-api','video-generation','SUCCEEDED','{}','fixture','fixture','{}',1,now())`;
    await db`insert into task_assets(task_id,user_id,storage_key,storage_backend,storage_scope,mime,byte_length,sha256)values(${task},${owner.id},${key},'s3',${meta.storageScope},'video/mp4',${media.length},${createHash("sha256").update(media).digest("hex")})`;
    const route = `/api/v1/tools/video/tasks/${task}/file`;
    assert.equal((await request(route)).status, 401);
    assert.equal((await request(route, member)).status, 404);
    const range = await request(route, admin, {
      headers: { Range: "bytes=2-18" },
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      media.subarray(2, 19),
    );
    assert.equal(
      (await request(route, admin, { method: "HEAD" })).headers.get(
        "content-length",
      ),
      String(media.length),
    );
    const download = await request(route + "?download=1", admin);
    assert(
      download.headers.get("content-disposition")?.startsWith("attachment"),
    );
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), media);
    assert.equal(
      (await request(route, admin, { headers: { Range: "bytes=999999999-" } }))
        .status,
      416,
    );
    checks.push(
      "real R2 authenticated video proxy: anonymous/other user denied; Range/HEAD/download/416 passed",
    );
    const [old] =
      await db`select task_id from task_assets where storage_backend='local' limit 1`;
    assert(old);
    const legacy = await request(
      `/api/v1/tools/video/tasks/${old.task_id}/file`,
      admin,
      { method: "HEAD" },
    );
    assert.equal(legacy.status, 200);
    checks.push("retained local video remains accessible with R2 enabled");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=",
      "base64",
    );
    async function upload(
      cookie: string,
      origin = base,
      bytes = png,
      mime = "image/png",
    ) {
      const f = new FormData();
      f.set("file", new File([bytes], "image.png", { type: mime }));
      return request("/api/v1/upload", cookie, {
        method: "POST",
        headers: { Origin: origin },
        body: f,
      });
    }
    assert.equal((await upload("")).status, 401);
    assert.equal((await upload(admin, "https://foreign.invalid")).status, 403);
    assert.equal(
      (await upload(admin, base, Buffer.from("invalid image signature")))
        .status,
      400,
    );
    const saved = await upload(admin);
    assert.equal(saved.status, 200);
    const data = (await saved.json()).data;
    uploads.push(data.id);
    assert.equal(data.private, true);
    assert.equal(new URL(data.publicUrl).origin, base);
    const imagePath = new URL(data.publicUrl).pathname;
    assert.equal((await request(imagePath)).status, 401);
    assert.equal((await request(imagePath, member)).status, 404);
    const image = await request(imagePath, admin);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    assert.equal(image.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    checks.push(
      "real R2 image upload/read: session/owner/origin/MIME/private URL controls passed",
    );
    assert.equal((await request("/api/v1/admin/runtime")).status, 401);
    assert.equal((await request("/api/v1/admin/runtime", member)).status, 403);
    assert.equal((await request("/api/v1/admin/runtime", admin)).status, 200);
    const ready = await request("/api/ready");
    assert.equal(ready.status, 503, "NoWorkers run must report unready");
    const body = await ready.json();
    assert.deepEqual(Object.keys(body).sort(), [
      "checkedAt",
      "checks",
      "status",
    ]);
    assert.equal(body.checks.storage, true);
    assert.equal((await request("/api/health")).status, 200);
    checks.push(
      "runtime API admin guard; no-worker readiness 503 while liveness 200; public response contains no internals",
    );
    await writeFile(
      "docs/project-state/aud-006-api-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          checks,
          modelCalls: 0,
          paymentCalls: 0,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(checks.map((x) => "PASS " + x).join("\n"));
  } finally {
    const s = await privateS3();
    if (key) await s.deleteObject(key);
    for (const id of uploads) {
      const [row] =
        await db`select storage_key from private_uploads where id=${id} and user_id=${owner.id}`;
      if (row) await s.deleteObject(row.storage_key);
      await db`delete from private_uploads where id=${id} and user_id=${owner.id}`;
    }
    await db`delete from task_assets where task_id=${task}`;
    await db`delete from tasks where id=${task}`;
    await unlink(assetPath(task)).catch(() => {});
    await db.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
