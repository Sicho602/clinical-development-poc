import { z } from "zod";

export const eligibilityAiOutputSchema = z.object({
  diseaseSeverity: z.string().nullable(),
  priorTreatmentRequirements: z.string().nullable(),
  treatmentLine: z.string().nullable(),
  washoutRequirements: z.string().nullable(),
  sourceText: z.record(z.string(), z.string().nullable()),
});

export type EligibilityAiOutput = z.infer<typeof eligibilityAiOutputSchema>;

export interface EligibilityExtractionRequest {
  nctId: string;
  eligibilityCriteria: string;
}

export interface EligibilityExtractionResult {
  status: "not_executed" | "completed" | "failed";
  provider: string;
  model?: string;
  promptVersion: string;
  output?: EligibilityAiOutput;
  reason?: string;
}

export const ELIGIBILITY_EXTRACTOR_PROMPT_VERSION = "eligibility-v1";

export function createIdleEligibilityExtraction(
  reason: string,
): EligibilityExtractionResult {
  return {
    status: "not_executed",
    provider: "none",
    promptVersion: ELIGIBILITY_EXTRACTOR_PROMPT_VERSION,
    reason,
  };
}
