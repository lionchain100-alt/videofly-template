import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, users, privateUploads } from "@/db";
import { ApiError } from "@/lib/api/error";
import {
  assetBackend,
  privateS3,
  privateS3Config,
  privateObject,
  objectHash,
} from "./private-storage";
import { assetPath } from "./video-assets";
export const uploadTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export function uploadPath(key: string) {
  if (!/^uploads\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(key))
    throw Error("Invalid upload key");
  return path.join(path.dirname(assetPath(randomUUID())), key);
}
function sniff(b: Buffer) {
  if (b.length < 12) return;
  const h = b.subarray(0, 12);
  if (h.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (h[0] === 255 && h[1] === 216 && h[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(h.toString("ascii"))) return "image/gif";
  if (
    h.toString("ascii", 0, 4) === "RIFF" &&
    h.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
}
export async function saveUpload(userId: string, file: File) {
  if (file.size <= 0 || file.size > 10485760 || !uploadTypes[file.type])
    throw new ApiError("图片类型或大小不支持", 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniff(bytes) !== file.type)
    throw new ApiError("图片内容与类型声明不匹配", 400);
  const id = randomUUID(),
    backend = assetBackend(),
    scope = backend === "s3" ? privateS3Config().scope : null,
    localKey = `uploads/${id}.${uploadTypes[file.type]}`,
    key =
      backend === "s3" ? `${privateS3Config().prefix}/${localKey}` : localKey;
  await db.transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    const [usage] = await tx
      .select({
        bytes:
          sql<number>`coalesce(sum(${privateUploads.byteLength}),0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(privateUploads)
      .where(
        and(
          eq(privateUploads.userId, userId),
          ne(privateUploads.status, "FAILED"),
        ),
      );
    if (usage.bytes + bytes.length > 500 * 1024 * 1024)
      throw new ApiError("已达到本站单用户上传配额", 409);
    await tx.insert(privateUploads).values({
      id,
      userId,
      storageBackend: backend,
      storageScope: scope,
      storageKey: key,
      mime: file.type,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      status: "WRITING",
    });
  });
  try {
    if (backend === "s3") {
      await (await privateS3()).putObject(key, bytes, file.type);
      const checked = await objectHash(key);
      if (
        checked.size !== bytes.length ||
        checked.sha256 !== createHash("sha256").update(bytes).digest("hex")
      )
        throw Error("Private upload integrity mismatch");
    } else {
      const name = uploadPath(key);
      await mkdir(path.dirname(name), { recursive: true });
      await writeFile(name, bytes, { flag: "wx" });
    }
    const committed = await db
      .update(privateUploads)
      .set({ status: "READY", updatedAt: new Date() })
      .where(
        and(eq(privateUploads.id, id), eq(privateUploads.status, "WRITING")),
      )
      .returning({ id: privateUploads.id });
    if (!committed.length) throw Error("Upload reservation expired");
    return { id, key, mime: file.type, byteLength: bytes.length };
  } catch {
    await db
      .update(privateUploads)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(privateUploads.id, id));
    throw new ApiError("私有图片保存失败，可稍后重试", 503);
  }
}
export async function uploadBody(asset: typeof privateUploads.$inferSelect) {
  if (asset.storageBackend === "local") {
    const bytes = await readFile(uploadPath(asset.storageKey));
    if (bytes.length !== asset.byteLength)
      throw Error("Upload length mismatch");
    return new Response(bytes);
  }
  if (
    asset.storageScope !== privateS3Config().scope ||
    asset.storageKey !==
      `${privateS3Config().prefix}/uploads/${asset.id}.${uploadTypes[asset.mime]}`
  )
    throw Error("Upload scope mismatch");
  const response = await privateObject(asset.storageKey);
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) !== asset.byteLength
  )
    throw Error("Private upload length mismatch");
  return response;
}
