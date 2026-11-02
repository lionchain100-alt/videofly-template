import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { siteManifest } from "@/config/site-manifest";
export function assetBackend() {
  const backend = process.env.ASSET_STORAGE_BACKEND || "local";
  if (!["local", "s3"].includes(backend)) throw Error("Invalid asset backend");
  return backend;
}
export function privateS3Config() {
  const endpoint = new URL(
    process.env.ASSET_S3_ENDPOINT || "https://not-configured.invalid",
  );
  const test =
    process.env.NODE_ENV !== "production" &&
    process.env.ASSET_S3_ALLOW_LOCAL_TEST === "true" &&
    endpoint.hostname === "127.0.0.1" &&
    endpoint.protocol === "http:";
  const bucket = process.env.ASSET_S3_BUCKET,
    accessKeyId = process.env.ASSET_S3_ACCESS_KEY_ID,
    secretAccessKey = process.env.ASSET_S3_SECRET_ACCESS_KEY,
    region = process.env.ASSET_S3_REGION || "auto";
  if (
    !process.env.ASSET_S3_ENDPOINT ||
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) ||
    !accessKeyId ||
    !secretAccessKey ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.protocol !== "https:" && !test)
  )
    throw Error("Private object storage configuration incomplete");
  const prefix = siteManifest.isolation.fileNamespace + "/private";
  const scope = createHash("sha256")
    .update(
      JSON.stringify({
        endpoint: endpoint.href,
        bucket,
        region,
        namespace: siteManifest.isolation.fileNamespace,
      }),
    )
    .digest("hex");
  return {
    endpoint: endpoint.href.replace(/\/$/, "") + "/" + bucket,
    region,
    accessKeyId,
    secretAccessKey,
    prefix,
    scope,
  };
}
export async function privateS3() {
  const { s3mini } = await import("s3mini");
  const { scope, prefix, ...config } = privateS3Config();
  return new s3mini({ ...config, requestAbortTimeout: 30000 });
}
function keyAllowed(key: string) {
  const prefix = privateS3Config().prefix;
  if (
    !key.startsWith(prefix + "/") ||
    key.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\\?#\x00-\x1f]/.test(key)
  )
    throw Error("Asset namespace mismatch");
}
export async function privateObject(key: string, start?: number, end?: number) {
  keyAllowed(key);
  try {
    const response = await (await privateS3()).getObjectRaw(
      key,
      start === undefined,
      start || 0,
      end === undefined ? 0 : end + 1,
    );
    if (!response.body) return response;
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setTimeout>,
      size = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        timer = setTimeout(() => {
          controller.error(Error("Private object read deadline"));
          void reader.cancel().catch(() => {});
        }, 90000);
      },
      async pull(controller) {
        try {
          const item = await reader.read();
          if (item.done) {
            clearTimeout(timer);
            controller.close();
            return;
          }
          size += item.value.byteLength;
          if (size > 200 * 1024 * 1024)
            throw Error("Object exceeds size limit");
          controller.enqueue(item.value);
        } catch (e) {
          clearTimeout(timer);
          controller.error(e);
          void reader.cancel().catch(() => {});
        }
      },
      async cancel() {
        clearTimeout(timer);
        await reader.cancel();
      },
    });
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    throw Error("Private object unavailable");
  }
}
export async function objectHash(key: string) {
  const response = await privateObject(key);
  if (!response.ok || !response.body) throw Error("Private object unavailable");
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body as any) {
    size += chunk.byteLength;
    if (size > 200 * 1024 * 1024) throw Error("Object exceeds size limit");
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size };
}
export async function putPrivateFile(
  taskId: string,
  file: string,
  sha256: string,
) {
  if (!/^[0-9a-f-]{36}$/.test(taskId)) throw Error("Invalid asset id");
  const c = privateS3Config(),
    client = await privateS3(),
    key = `${c.prefix}/videos/${taskId}.mp4`,
    size = (await stat(file)).size;
  if (size <= 0 || size > 200 * 1024 * 1024) throw Error("Invalid asset size");
  if (await client.objectExists(key)) {
    const old = await objectHash(key);
    if (old.sha256 !== sha256 || old.size !== size)
      throw Error("Existing private object differs; refusing overwrite");
  } else {
    await client.putObject(key, await readFile(file), "video/mp4");
    const checked = await objectHash(key);
    if (checked.sha256 !== sha256 || checked.size !== size)
      throw Error("Private object integrity mismatch");
  }
  return { storageBackend: "s3", storageScope: c.scope, storageKey: key };
}
export async function privateStorageReady() {
  return (
    assetBackend() === "local" || (await (await privateS3()).bucketExists())
  );
}
