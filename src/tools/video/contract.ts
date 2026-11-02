import { z } from "zod";
export const videoInputSchema = z
  .object({
    prompt: z.string().trim().min(10).max(1500),
    aspectRatio: z.enum(["16:9", "9:16"]),
  })
  .strict();
export const videoSubmissionSchema = z
  .object({
    requestId: z.string().uuid(),
    input: videoInputSchema,
    policyRevision: z.number().int().positive().optional(),
  })
  .strict();
export type VideoInput = z.infer<typeof videoInputSchema>;
export interface LiveVideoTask {
  id: string;
  requestId: string;
  status: string;
  stage: string;
  input: VideoInput;
  credits: number;
  creditStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastError: string | null;
  videoUrl: string | null;
  createdAt: string;
  providerTaskId: string | null;
  model: string;
}
