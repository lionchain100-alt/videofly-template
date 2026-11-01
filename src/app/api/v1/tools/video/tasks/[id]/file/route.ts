import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db, taskAssets } from "@/db";
import { requireAuth } from "@/lib/api/auth";
import { apiError, handleApiError } from "@/lib/api/response";
import { assetPath } from "@/services/video-assets";
export const dynamic = "force-dynamic";
async function serve(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  head = false,
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;
    const [asset] = await db.select().from(taskAssets).where(eq(taskAssets.taskId, id)).limit(1);
    if (!asset || (asset.userId !== user.id && !(user.isAdmin && user.emailVerified)))
      return apiError("视频不存在", 404);
    const file = assetPath(id);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      return apiError("本地视频文件暂不可用，请联系管理员恢复存储", 503);
    }
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };
    if (new URL(request.url).searchParams.get("download") === "1")
      headers["Content-Disposition"] = `attachment; filename="video-${id}.mp4"`;
    let start = 0;
    let end = size - 1;
    let status = 200;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      if (!match[1]) {
        start = Math.max(0, size - Number(match[2]));
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        start > end ||
        start >= size ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end)
      )
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    return new Response(
      head ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream),
      { status, headers },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
export const GET = serve;
export function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return serve(request, context, true);
}
