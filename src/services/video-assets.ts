import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { mkdir, open, rename, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import {Readable} from 'node:stream';
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { siteManifest } from "@/config/site-manifest";
import {
  assetBackend,
  putPrivateFile,
  privateS3Config,
  privateS3,
  privateObject,
} from "./private-storage";

const directory = () =>
  process.env.ASSET_LOCAL_DIRECTORY ||
  join(process.cwd(), siteManifest.isolation.localVideoDirectory);
export function assetPath(taskId: string) {
  if (!/^[0-9a-f-]{36}$/.test(taskId)) throw Error("Invalid task id");
  return join(directory(), `${taskId}.mp4`);
}
export function publicAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (isIP(lower) === 4) {
    const [a, b] = lower.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Only globally routable IPv6. Mapped/compatible IPv4 and local/reserved ranges are rejected.
  return (
    isIP(lower) === 6 &&
    /^[23][0-9a-f]{3}:/.test(lower) &&
    !lower.startsWith("2001:db8:") &&
    !lower.startsWith("2002:")
  );
}
export async function safeVideoResponse(
  value: string,
  redirects = 0,
): Promise<IncomingMessage> {
  const url = new URL(value);
  const fixture =
    process.env.NODE_ENV !== "production" &&
    process.env.VIDEO_ALLOW_LOCAL_TEST === "true" &&
    url.hostname === "127.0.0.1";
  if (
    url.username ||
    url.password ||
    url.hash ||
    (!fixture &&
      (url.protocol !== "https:" || (url.port && url.port !== "443")))
  )
    throw Error("Unsafe video source");
  if (fixture && url.protocol !== "http:") throw Error("Invalid fixture URL");
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    (!fixture && addresses.some((a) => !publicAddress(a.address)))
  )
    throw Error("Private source addresses are not permitted");
  const target = addresses[0];
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        agent: false,
        lookup: ((
          _hostname: unknown,
          _options: unknown,
          callback: (
            error: Error | null,
            value: unknown,
            family?: number,
          ) => void,
        ) =>
          (_options as { all?: boolean })?.all
            ? callback(null, [target])
            : callback(null, target.address, target.family)) as never,
        headers: { Accept: "video/mp4,application/octet-stream" },
      },
      resolve,
    );
    req.setTimeout(30000, () => req.destroy(Error("Video download timed out")));
    req.on("error", reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
    const location = response.headers.location;
    response.destroy();
    if (!location || redirects >= 3) throw Error("Invalid video redirect");
    return safeVideoResponse(new URL(location, url).toString(), redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.destroy();
    throw Error("Video download unavailable");
  }
  return response;
}
export async function storeVideo(taskId: string, sourceUrl: string) {
  const local = await storeLocalVideo(taskId, sourceUrl);
  if (assetBackend() === "s3")
    return {
      ...local,
      ...(await putPrivateFile(taskId, assetPath(taskId), local.sha256)),
    };
  return { ...local, storageBackend: "local", storageScope: null };
}
async function storeLocalVideo(taskId: string, sourceUrl: string) {
  await mkdir(directory(), { recursive: true });
  const destination = assetPath(taskId);
  // A completed local file can be reused after a process restart without downloading again.
  try {
    const existing = await stat(destination);
    if (existing.size > 0) {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(destination))
        hash.update(chunk);
      return {
        storageKey: `${taskId}.mp4`,
        mime: "video/mp4",
        byteLength: existing.size,
        sha256: hash.digest("hex"),
      };
    }
  } catch {}
  const response = await safeVideoResponse(sourceUrl);
  const type = (response.headers["content-type"] || "").split(";")[0];
  if (
    !["video/mp4", "application/octet-stream", "binary/octet-stream"].includes(
      type,
    )
  ) {
    response.destroy();
    throw Error("Unsupported video content type");
  }
  const maxBytes = 200 * 1024 * 1024;
  if (Number(response.headers["content-length"] || 0) > maxBytes) {
    response.destroy();
    throw Error("Video is too large");
  }
  const temporary = join(directory(), `${taskId}.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);
  const timer = setTimeout(
    () => response.destroy(Error("Video download deadline exceeded")),
    90000,
  );
  try {
    for await (const chunk of response) {
      const value = Buffer.from(chunk);
      bytes += value.length;
      if (bytes > maxBytes) throw Error("Video size exceeds limit");
      if (header.length < 16)
        header = Buffer.concat([header, value]).subarray(0, 16);
      hash.update(value);
      await file.writeFile(value);
    }
    if (bytes < 24 || header.toString("ascii", 4, 8) !== "ftyp")
      throw Error("Invalid MP4 result");
    await file.sync();
    await file.close();
    await rename(temporary, destination);
    return {
      storageKey: `${taskId}.mp4`,
      mime: "video/mp4",
      byteLength: bytes,
      sha256: hash.digest("hex"),
    };
  } catch (e) {
    await file.close().catch(() => {});
    const { unlink } = await import("node:fs/promises");
    await unlink(temporary).catch(() => {});
    response.destroy();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export async function storedAssetSize(asset: {
  taskId: string;
  storageBackend?: string;
  storageScope?: string | null;
  storageKey: string;
  byteLength: number;
}) {
  if ((asset.storageBackend || "local") === "local") {
    if (asset.storageKey !== `${asset.taskId}.mp4`)
      throw Error("Invalid local asset key");
    return (await stat(assetPath(asset.taskId))).size;
  }
  if (
    asset.storageBackend !== "s3" ||
    asset.storageScope !== privateS3Config().scope
  )
    throw Error("Private bucket configuration differs from original asset");
  if (
    asset.storageKey !==
    `${privateS3Config().prefix}/videos/${asset.taskId}.mp4`
  )
    throw Error("Asset namespace mismatch");
  return (await privateS3()).getContentLength(asset.storageKey);
}
export async function storedAssetBody(
  asset: {
    taskId: string;
    storageBackend?: string;
    storageScope?: string | null;
    storageKey: string;
    byteLength: number;
  },
  start: number,
  end: number,
) {
  if ((asset.storageBackend || "local") === "local")
    return Readable.toWeb(
      createReadStream(assetPath(asset.taskId), { start, end }),
    ) as ReadableStream;
  const response = await privateObject(asset.storageKey, start, end);
  if (
    response.status !== 206 &&
    !(response.status === 200 && start === 0 && end === asset.byteLength - 1)
  )
    throw Error("Private storage did not honor requested range");
  if (Number(response.headers.get("content-length")) !== end - start + 1)
    throw Error("Private object length mismatch");
  return response.body;
}
