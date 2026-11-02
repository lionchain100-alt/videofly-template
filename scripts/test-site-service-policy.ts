import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "dotenv";
async function main() {
  config({ path: ".env.local", quiet: true });
  const file = "src/config/site.json";
  const raw = await readFile(file, "utf8");
  const site = JSON.parse(raw);
  if (site.origin !== "http://localhost:3000")
    throw new Error("Run the policy fixture in the dedicated main local site");
  let calls = 0;
  try {
    site.tools = { "text-summary": false, "video-generation": false };
    await writeFile(file, JSON.stringify(site, null, 2) + "\n");
    const { reserveToolTask } = await import("../src/services/tasks");
    for (const tool of ["text-summary", "video-generation"])
      await assert.rejects(
        () =>
          reserveToolTask(
            "nonexistent-user",
            "nonexistent-request",
            {},
            tool,
            () => {
              calls++;
              throw new Error("Provider configuration must not be resolved");
            },
          ),
        (e) => (e as { status?: number }).status === 403,
      );
    assert.equal(calls, 0);
    const { build } = await import("esbuild");
    await build({
      entryPoints: ["src/lib/storage.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: ".local/aud003-storage.mjs",
    });
    const { pathToFileURL } = await import("node:url");
    const { resolve } = await import("node:path");
    const { Storage } = await import(
      pathToFileURL(resolve(".local/aud003-storage.mjs")).href
    );
    const storage = new Storage({
      endpoint: "https://storage.invalid",
      region: "auto",
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
      bucket: "fixture",
    });
    let key = "";
    (
      storage as unknown as { client: { putObject: (key: string) => Promise<{ ok: boolean }> } }
    ).client.putObject = async (value: string) => {
      key = value;
      return { ok: true };
    };
    const result = await storage.uploadFile({
      key: "fixture.mp4",
      body: Buffer.from("fixture"),
    });
    assert.equal(key, `${site.isolation.fileNamespace}/fixture.mp4`);
    assert.equal(result.key, key);
    console.log(
      "PASS direct service calls reject both disabled tools before user/provider/credits; object storage writes use the site namespace; no provider/storage network calls.",
    );
  } finally {
    await writeFile(file, raw);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
