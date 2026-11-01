import { NextResponse } from "next/server";
import { z } from "zod";
import {
  studioCookieName,
  checkLocalHeaders,
  getStudioToken,
  readUIConfig,
  updateUIConfig,
} from "@/ui-studio/server";
import { uiConfigSchema } from "@/ui-presets/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function deny() {
  return NextResponse.json(
    { error: "本地 UI Studio 未启用或请求来源不受信任。" },
    { status: 403 },
  );
}
export async function GET(request: Request) {
  if (!checkLocalHeaders(request.headers)) return deny();
  const response = NextResponse.json(
    { ...(await readUIConfig()), token: getStudioToken() },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(studioCookieName, getStudioToken(), {
    httpOnly: true,
    sameSite: "strict",
    path: "/api/ui-studio",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
async function save(request: Request, rollback: boolean) {
  if (!checkLocalHeaders(request.headers, true)) return deny();
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16_384)
      return NextResponse.json(
        { error: "配置文件超过 16KB。" },
        { status: 413 },
      );
    const input = z
      .object({
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        config: rollback ? z.undefined().optional() : uiConfigSchema,
      })
      .strict()
      .parse(JSON.parse(raw));
    return NextResponse.json(
      await updateUIConfig(rollback ? null : input.config!, input.revision),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    const conflict = message === "CONFLICT";
    return NextResponse.json(
      {
        error: conflict
          ? "站点配置已被其他窗口修改。请先读取已应用配置，再重新应用你的草稿。"
          : message.includes("ENOENT")
            ? "还没有可恢复的上一个版本。"
            : "配置无效或写入失败，原站点配置未被替换。",
        details:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
            : undefined,
      },
      { status: conflict ? 409 : 400 },
    );
  }
}
export const PUT = (request: Request) => save(request, false);
export const POST = (request: Request) => save(request, true);
