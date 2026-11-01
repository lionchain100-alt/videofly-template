import { z } from "zod";
import type { VideoInput } from "@/tools/video/contract";
export class VideoProviderError extends Error {
  constructor(
    public code: string,
    public definite: boolean,
    message: string,
  ) {
    super(message);
  }
}
const schema = z.object({
  provider: z.literal("kie"),
  baseUrl: z.string().url(),
  apiKey: z.string().trim().min(1),
  model: z.literal("wan/2-7-text-to-video"),
  credits: z.coerce.number().int().min(1).max(10000),
});
export function videoConfig() {
  if (process.env.VIDEO_AI_ENABLED !== "true")
    throw new VideoProviderError("NOT_CONFIGURED", true, "视频模型尚未启用，不会冻结积分。");
  const parsed = schema.safeParse({
    provider: process.env.VIDEO_AI_PROVIDER,
    baseUrl: process.env.VIDEO_AI_BASE_URL,
    apiKey: process.env.KIE_API_KEY,
    model: process.env.VIDEO_AI_MODEL,
    credits: process.env.VIDEO_GENERATION_CREDITS || "10",
  });
  if (!parsed.success)
    throw new VideoProviderError("NOT_CONFIGURED", true, "Kie 视频配置不完整，不会冻结积分。");
  const cfg = parsed.data;
  const url = new URL(cfg.baseUrl);
  const fixture =
    process.env.NODE_ENV !== "production" &&
    process.env.VIDEO_ALLOW_LOCAL_TEST === "true" &&
    url.hostname === "127.0.0.1";
  if (
    (!fixture && url.origin !== "https://api.kie.ai") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new VideoProviderError("NOT_CONFIGURED", true, "Kie 接口地址无效。");
  cfg.baseUrl = cfg.baseUrl.replace(/\/$/, "");
  return cfg;
}
export function publicVideoConfig() {
  try {
    const c = videoConfig();
    return { enabled: true, credits: c.credits, model: c.model, duration: 5, resolution: "1080p" };
  } catch {
    return {
      enabled: false,
      credits: null,
      model: "wan/2-7-text-to-video",
      duration: 5,
      resolution: "1080p",
    };
  }
}
export function videoSnapshot(c: ReturnType<typeof videoConfig>) {
  return {
    provider: c.provider,
    baseUrl: c.baseUrl,
    model: c.model,
    duration: 5,
    resolution: "1080p",
  };
}
async function request(c: ReturnType<typeof videoConfig>, path: string, body?: unknown) {
  const submit = body !== undefined;
  try {
    const response = await fetch(`${c.baseUrl}${path}`, {
      method: submit ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: submit ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new VideoProviderError(
        `HTTP_${response.status}`,
        submit && [400, 401, 402, 403, 422, 429].includes(response.status),
        "视频接口暂不可用。",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 128000) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (data.code !== 200)
      throw new VideoProviderError(
        `KIE_${Number(data.code) || "UNKNOWN"}`,
        submit && [400, 401, 402, 403, 422, 429, 455].includes(data.code),
        "Kie 拒绝请求或状态暂不可查询。",
      );
    return data.data;
  } catch (e) {
    if (e instanceof VideoProviderError) throw e;
    throw new VideoProviderError(
      "NETWORK_UNCERTAIN",
      false,
      "视频请求响应中断，需要核实，不会自动重新生成。",
    );
  }
}
export async function submitKieVideo(input: VideoInput, c: ReturnType<typeof videoConfig>) {
  const result = await request(c, "/api/v1/jobs/createTask", {
    model: c.model,
    input: {
      prompt: input.prompt,
      ratio: input.aspectRatio,
      resolution: "1080p",
      duration: 5,
      prompt_extend: false,
      watermark: false,
    },
  });
  if (typeof result?.taskId !== "string" || !result.taskId.trim() || result.taskId.length > 200)
    throw new VideoProviderError("SUBMISSION_UNCONFIRMED", false, "未收到可用任务编号，需要核实。");
  return result.taskId as string;
}
export async function queryKieVideo(id: string, c: ReturnType<typeof videoConfig>) {
  const data = await request(c, `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(id)}`);
  if (data?.taskId !== id)
    throw new VideoProviderError("TASK_ID_MISMATCH", false, "供应商返回的任务编号不匹配。");
  let prompt: string | null = null;
  try {
    const param = typeof data.param === "string" ? JSON.parse(data.param) : data.param;
    const input = typeof param?.input === "string" ? JSON.parse(param.input) : param?.input;
    prompt = typeof input?.prompt === "string" ? input.prompt : null;
  } catch {}
  const metadata = { model: typeof data.model === "string" ? data.model : null, prompt };
  if (data.state === "fail") return { state: "failed" as const, ...metadata };
  if (data.state === "success") {
    try {
      const value =
        typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
      const url = z.string().url().max(8192).parse(value.resultUrls[0]);
      return { state: "success" as const, url, ...metadata };
    } catch {
      throw new VideoProviderError(
        "INVALID_RESULT",
        false,
        "模型显示成功但结果地址无效，需要重新查询。",
      );
    }
  }
  if (!["waiting", "queuing", "generating"].includes(data.state))
    throw new VideoProviderError("UNKNOWN_STATE", false, "供应商状态未知，继续核实。");
  return { state: "running" as const, ...metadata };
}
