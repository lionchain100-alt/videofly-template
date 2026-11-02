import { eq } from "drizzle-orm";
import { db, privateUploads } from "@/db";
import { requireAuth } from "@/lib/api/auth";
import { apiError, handleApiError } from "@/lib/api/response";
import { uploadBody } from "@/services/private-uploads";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;
    const [asset] = await db
      .select()
      .from(privateUploads)
      .where(eq(privateUploads.id, id));
    if (
      !asset ||
      asset.status !== "READY" ||
      (asset.userId !== user.id && !(user.isAdmin && user.emailVerified))
    )
      return apiError("文件不存在", 404);
    const response = await uploadBody(asset);
    if (!response.ok) throw Error("Private upload unavailable");
    return new Response(response.body, {
      headers: {
        "Content-Type": asset.mime,
        "Content-Length": String(asset.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
