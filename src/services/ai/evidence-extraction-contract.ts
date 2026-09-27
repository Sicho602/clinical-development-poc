import type {
  EvidenceExtraction,
  EvidenceExtractionIssue,
  EvidenceFieldKey,
  ExtractedEvidenceField,
  Publication,
} from "@/domain/models";

export const evidenceFieldKeys = [
  "population",
  "line_of_therapy",
  "treatment",
  "comparator",
  "sample_size",
  "study_design",
  "primary_endpoint",
  "secondary_endpoints",
  "orr",
  "pfs",
  "os",
  "dor",
  "hazard_ratio",
  "confidence_interval",
  "safety_findings",
  "conclusion",
] as const satisfies readonly EvidenceFieldKey[];

export const evidenceFieldLabels: Record<EvidenceFieldKey, string> = {
  population: "대상 환자군",
  line_of_therapy: "치료차수",
  treatment: "시험약 / 중재",
  comparator: "대조군",
  sample_size: "대상자 수 (N)",
  study_design: "시험 설계",
  primary_endpoint: "일차 평가변수",
  secondary_endpoints: "이차 평가변수",
  orr: "ORR",
  pfs: "PFS / mPFS",
  os: "OS / mOS",
  dor: "DOR",
  hazard_ratio: "HR",
  confidence_interval: "CI",
  safety_findings: "안전성 소견",
  conclusion: "결론",
};

export const evidenceExtractionSystemPrompt = `You extract only explicitly stated clinical facts from a PubMed abstract.

Return one JSON object with this shape:
{"fields":[{"field":"orr","value":21,"unit":"%","sourceText":"The objective response rate was 21%."}]}

Allowed field names:
population, line_of_therapy, treatment, comparator, sample_size, study_design,
primary_endpoint, secondary_endpoints, orr, pfs, os, dor, hazard_ratio,
confidence_interval, safety_findings, conclusion.

Rules:
1. Use only the supplied public PubMed metadata. Do not use outside knowledge.
2. Omit any field not explicitly stated. Never infer phase, line of therapy,
   comparator, endpoint classification, sample size, or efficacy values.
3. sourceText is mandatory and must be an exact contiguous substring copied
   from the abstract. Do not paraphrase sourceText.
4. The sourceText must directly support the extracted value.
5. Keep numbers as numbers where possible and put %, months, patients, or
   other units in unit.
6. Do not convert units or calculate values.
7. Return valid JSON only, without markdown.`;

export interface ExtractionPublicationPayload {
  pmid: string;
  title: string;
  abstract: string;
  publicationTypes: string[];
  evidenceCategories: string[];
}

export interface EvidenceExtractionProviderDescriptor {
  provider: "mock" | "openai-compatible" | "qwen";
  isMock: boolean;
}

export interface EvidenceExtractionApiResult {
  pmid: string;
  fields: Array<Omit<ExtractedEvidenceField, "id">>;
  issues: EvidenceExtractionIssue[];
  provider: string;
  model?: string;
  isMock: boolean;
  extractedAt: string;
}

export function toExtractionPublicationPayload(
  publication: Publication,
): ExtractionPublicationPayload {
  return {
    pmid: publication.pmid,
    title: publication.title,
    abstract: publication.abstract ?? "",
    publicationTypes: [...publication.publicationTypes],
    evidenceCategories: [...publication.evidenceCategories],
  };
}

export function materializeEvidenceExtraction(
  assessmentId: string,
  result: EvidenceExtractionApiResult,
): EvidenceExtraction {
  const now = new Date().toISOString();
  const mode = result.isMock ? "mock" : "real";
  return {
    id: `${assessmentId}:${mode}:${result.pmid}`,
    assessmentId,
    pmid: result.pmid,
    fields: result.fields.map((field) => ({
      ...field,
      id: `${assessmentId}:${mode}:${result.pmid}:${field.field}`,
    })),
    issues: result.issues,
    extractionStatus: "extracted",
    provider: result.provider,
    model: result.model,
    isMock: result.isMock,
    extractedAt: result.extractedAt,
    createdAt: now,
    updatedAt: now,
  };
}
