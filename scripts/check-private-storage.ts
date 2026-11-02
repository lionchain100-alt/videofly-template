import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  privateS3,
  privateS3Config,
  privateObject,
  objectHash,
} from "../src/services/private-storage";
async function main() {
  const c = privateS3Config(),
    s = await privateS3(),
    key = `${c.prefix}/probes/${randomUUID()}.bin`,
    bytes = Buffer.from("AUD006 private object round trip " + randomUUID());
  const checks: string[] = [];
  assert(await s.bucketExists());
  checks.push("authenticated bucket HEAD");
  try {
    await s.putObject(key, bytes, "application/octet-stream");
    assert.deepEqual(await objectHash(key), {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    });
    checks.push("signed PUT/GET integrity");
    const range = await privateObject(key, 2, 8);
    assert.equal(range.status, 206);
    assert.deepEqual(
      Buffer.from(await range.arrayBuffer()),
      bytes.subarray(2, 9),
    );
    checks.push("signed Range");
    const anonymous = await fetch(c.endpoint + "/" + key, {
      signal: AbortSignal.timeout(15000),
    });
    assert([400, 401, 403, 404].includes(anonymous.status));
    checks.push("anonymous object denied");
  } finally {
    await s.deleteObject(key);
  }
  assert.equal(await s.objectExists(key), false);
  checks.push("owned probe deleted");
  const result = { at: new Date().toISOString(), checks, secretOutput: false };
  await writeFile(
    "docs/project-state/aud-006-r2-results.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
}
main().catch(() => {
  console.error(
    "Private storage probe failed; inspect configuration/connectivity without logging credentials",
  );
  process.exitCode = 1;
});
