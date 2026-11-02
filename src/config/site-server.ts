import { readFile } from "node:fs/promises";
import path from "node:path";
import { siteManifestSchema, type ToolId } from "./site-manifest";
import { ApiError } from "@/lib/api/error";
export const siteConfigPath = () =>
  path.join(process.cwd(), "src/config/site.json");
export async function readSiteManifest() {
  return siteManifestSchema.parse(
    JSON.parse(await readFile(siteConfigPath(), "utf8")),
  );
}
/** New submissions only; existing workers, history, assets and financial settlement remain available. */
export async function assertToolEnabled(id: ToolId) {
  if (!(await readSiteManifest()).tools[id])
    throw new ApiError("该工具已由本站关闭，不能提交新任务", 403, {
      code: "TOOL_DISABLED",
      toolId: id,
    });
}
