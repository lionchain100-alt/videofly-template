import { z } from "zod";
const micros = z.number().int().min(0).max(1_000_000_000_000);
export const profileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,60}$/),
    toolId: z.enum(["text-summary", "video-generation"]),
    label: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(150),
    enabled: z.boolean(),
    sort: z.number().int().min(0).max(1000),
    credits: z.number().int().min(1).max(10000),
    maxTokens: z.number().int().min(256).max(8192),
    timeoutMs: z.number().int().min(1000).max(120000),
    inputUsdPerMillion: z.number().finite().min(0).max(1000),
    outputUsdPerMillion: z.number().finite().min(0).max(1000),
    fixedMicros: micros,
    priceSource: z.string().trim().min(1).max(300),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.toolId === "text-summary" &&
      v.inputUsdPerMillion + v.outputUsdPerMillion <= 0
    )
      c.addIssue({
        code: "custom",
        message: "Text cost rates must be positive",
      });
    if (v.toolId === "video-generation" && v.fixedMicros <= 0)
      c.addIssue({
        code: "custom",
        message: "Video estimate must be positive",
      });
  });
export const policySchema = z
  .object({
    perMinute: z.number().int().min(1).max(100000),
    perDay: z.number().int().min(1).max(1000000),
    dailyMicros: micros,
    monthlyMicros: micros,
    defaults: z
      .object({ "text-summary": z.string(), "video-generation": z.string() })
      .strict(),
    profiles: z.array(profileSchema).min(2).max(20),
  })
  .strict()
  .superRefine((v, c) => {
    const ids = new Set(v.profiles.map((p) => p.id));
    if (ids.size !== v.profiles.length)
      c.addIssue({ code: "custom", message: "Duplicate profile ID" });
    for (const t of ["text-summary", "video-generation"] as const)
      if (!v.profiles.some((p) => p.id === v.defaults[t] && p.toolId === t))
        c.addIssue({
          code: "custom",
          message: "Default must reference a profile for its tool",
        });
  });
export type AiPolicy = z.infer<typeof policySchema>;
export type AiProfile = z.infer<typeof profileSchema>;
export function initialPolicy(): AiPolicy {
  return policySchema.parse({
    perMinute: 5,
    perDay: 50,
    dailyMicros: 10000000,
    monthlyMicros: 100000000,
    defaults: {
      "text-summary": "summary-default",
      "video-generation": "video-default",
    },
    profiles: [
      {
        id: "summary-default",
        toolId: "text-summary",
        label: "文本摘要",
        model: process.env.TEXT_AI_MODEL || "deepseek-flash",
        enabled: true,
        sort: 10,
        credits: Number(process.env.TEXT_SUMMARY_CREDITS || 1),
        maxTokens: Number(process.env.TEXT_AI_MAX_OUTPUT_TOKENS || 2048),
        timeoutMs: Number(process.env.TEXT_AI_TIMEOUT_MS || 60000),
        inputUsdPerMillion: 0.3,
        outputUsdPerMillion: 1.2,
        fixedMicros: 0,
        priceSource:
          "https://api-docs.deepseek.com/quick_start/pricing/ · 2026-11-02 peak/cache-miss estimate",
      },
      {
        id: "video-default",
        toolId: "video-generation",
        label: "Wan 2.7 文生视频",
        model: "wan/2-7-text-to-video",
        enabled: true,
        sort: 20,
        credits: Number(process.env.VIDEO_GENERATION_CREDITS || 10),
        maxTokens: 2048,
        timeoutMs: 30000,
        inputUsdPerMillion: 0,
        outputUsdPerMillion: 0,
        fixedMicros: 600000,
        priceSource:
          "https://kie.ai/wan-2-7-video · 2026-11-02 5s/1080p public estimate",
      },
    ],
  });
}
export const changePolicySchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    reason: z.string().trim().min(12).max(300),
    config: policySchema,
  })
  .strict();
export const costReviewSchema = z
  .object({
    requestId: z.string().uuid(),
    taskId: z.string().uuid(),
    amountMicros: micros,
    evidenceReference: z.string().trim().min(8).max(240),
    reason: z.string().trim().min(12).max(300),
  })
  .strict();
export const acceptedCapabilities = {
  "text-summary": {
    executor: "chat-completions",
    parameters: {
      language: ["zh", "en"],
      length: ["short", "long"],
      maxCharacters: 8000,
    },
    acceptance:
      "DeepSeek retained real summary evidence; other allowlisted model IDs require separate live acceptance",
    credential: "TEXT_AI_API_KEY",
  },
  "video-generation": {
    executor: "kie-durable-jobs",
    parameters: {
      duration: [5],
      resolution: ["1080p"],
      aspectRatio: ["16:9", "9:16"],
    },
    acceptance: {
      "16:9": "retained-real",
      "9:16": "schema-compatible-local-only; live acceptance pending",
    },
    credential: "KIE_API_KEY",
  },
  legacy: {
    providers: ["evolink", "kie", "apimart"],
    acceptance:
      "legacy adapters retained; not accepted on the new task/cost chain",
    submission: "/api/v1/video/generate returns 410",
    callbacks: "legacy signed callbacks only; do not drive new tasks",
    downloads:
      "legacy videoService retained; new task assets use private storage",
  },
};
