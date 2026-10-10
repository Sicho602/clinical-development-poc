import { z } from "zod";

import type { ClinicalDesignDomain } from "@/domain/models";

export const trialDesignComparisonInsightSchema = z.object({
  domain: z.enum([
    "population",
    "eligibility",
    "treatment",
    "endpoint",
    "timepoint",
    "sample_size",
    "study_duration",
    "enrollment",
    "statistical",
    "results",
  ]),
  comparison: z.string(),
  clinicalImplication: z.string(),
  supportingNctIds: z.array(z.string()),
  evidenceGaps: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
});

export const trialDesignComparatorOutputSchema = z.object({
  insights: z.array(trialDesignComparisonInsightSchema),
});

export type TrialDesignComparatorOutput = z.infer<
  typeof trialDesignComparatorOutputSchema
>;

export interface TrialDesignComparatorResult {
  status: "not_executed" | "mock" | "completed" | "failed";
  provider: string;
  model?: string;
  promptVersion: string;
  output?: TrialDesignComparatorOutput;
  reason?: string;
}

export const TRIAL_DESIGN_COMPARATOR_PROMPT_VERSION = "design-compare-v1";

export function createIdleTrialDesignComparison(
  reason: string,
): TrialDesignComparatorResult {
  return {
    status: "not_executed",
    provider: "none",
    promptVersion: TRIAL_DESIGN_COMPARATOR_PROMPT_VERSION,
    reason,
  };
}

export function insightForDomain(
  output: TrialDesignComparatorOutput | undefined,
  domain: ClinicalDesignDomain,
) {
  return output?.insights.find((insight) => insight.domain === domain);
}
