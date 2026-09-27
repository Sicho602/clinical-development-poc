import "server-only";

import {
  RemoteEvidenceExtractionService,
  type EvidenceExtractionService,
} from "@/services/ai/evidence-extraction-service";
import type { EvidenceExtractionProviderDescriptor } from "@/services/ai/evidence-extraction-contract";
import { MockEvidenceExtractionProvider } from "@/services/ai/mock-evidence-extraction-provider";

export type EvidenceExtractionProviderName =
  | "mock"
  | "openai-compatible"
  | "qwen";

export function getEvidenceExtractionProviderDescriptor(): EvidenceExtractionProviderDescriptor {
  const provider = normalizeProvider(
    process.env.EVIDENCE_EXTRACTION_PROVIDER,
  );
  return { provider, isMock: provider === "mock" };
}

export function createEvidenceExtractionProvider(): EvidenceExtractionService {
  const { provider } = getEvidenceExtractionProviderDescriptor();
  if (provider === "mock") return new MockEvidenceExtractionProvider();
  if (provider === "openai-compatible") {
    return new RemoteEvidenceExtractionService();
  }
  throw new Error(
    "Qwen provider is not configured. Add a provider adapter before use.",
  );
}

function normalizeProvider(
  value: string | undefined,
): EvidenceExtractionProviderName {
  if (!value) return "openai-compatible";
  if (value === "mock" || value === "openai-compatible" || value === "qwen") {
    return value;
  }
  throw new Error(`Unsupported Evidence Extraction provider: ${value}`);
}
