import { requireAuth } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/error";
import { apiSuccess, handleApiError } from "@/lib/api/response";
import { saveUpload } from "@/services/private-uploads";
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request);
    if (
      request.headers.get("origin") !==
        new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin ||
      ["cross-site", "same-site"].includes(
        request.headers.get("sec-fetch-site") || "",
      )
    )
      throw new ApiError("上传来源不受信任", 403);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new ApiError("需要 multipart 上传", 415);
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError("缺少图片", 400);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10485760 + 65536) {
        await reader.cancel();
        throw new ApiError("上传内容过大", 413);
      }
      chunks.push(value);
    }
    const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type")! },
        body: Buffer.concat(chunks),
      }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("缺少图片", 400);
    const saved = await saveUpload(user.id, file);
    return apiSuccess({
      ...saved,
      publicUrl: new URL(
        `/api/v1/uploads/${saved.id}`,
        process.env.NEXT_PUBLIC_APP_URL || request.url,
      ).href,
      private: true,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
