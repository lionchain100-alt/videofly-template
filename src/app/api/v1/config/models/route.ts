import { getAvailableModels } from "@/config/credits";
import { apiSuccess } from "@/lib/api/response";
import { getConfiguredAIProvider } from "@/ai";
import { readSiteManifest } from "@/config/site-server";

export async function GET() {
  if (!(await readSiteManifest()).tools["video-generation"])
    return apiSuccess([]);
  const models = getAvailableModels({
    provider: getConfiguredAIProvider(),
  });
  return apiSuccess(models);
}
