import { z } from "zod";

export const summaryInputSchema = z
  .object({
    text: z.string().trim().min(20).max(8000),
    length: z.enum(["short", "long"]),
    language: z.enum(["zh", "en"]),
  })
  .strict();
export const summarySubmissionSchema = z
  .object({
    requestId: z.string().uuid(),
    policyRevision: z.number().int().positive().optional(),
    input: summaryInputSchema,
  })
  .strict();
export type SummaryInput = z.infer<typeof summaryInputSchema>;
export interface SummaryTask {
  id: string;
  requestId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  input: SummaryInput;
  credits: number;
  result: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  creditStatus: string | null;
}
