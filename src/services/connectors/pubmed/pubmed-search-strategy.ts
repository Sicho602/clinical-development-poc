import type {
  Assessment,
  EvidenceCategory,
  PubMedSearchStrategy,
} from "@/domain/models";

export const evidenceCategoryLabels: Record<EvidenceCategory, string> = {
  disease_landscape: "질환 현황",
  historical_benchmark: "기존 치료성과",
  target_moa: "표적 / 작용기전",
  similar_drugs: "유사 약물",
  study_design: "시험 설계",
  safety: "안전성",
};

export const evidenceCategoryQuestions: Record<EvidenceCategory, string> = {
  disease_landscape:
    "현재 해당 적응증 및 치료단계의 치료환경과 주요 임상 결과는 무엇인가?",
  historical_benchmark:
    "현재 대상 population에서 기존 치료의 주요 efficacy benchmark는 무엇인가?",
  target_moa:
    "해당 target 또는 mechanism of action의 임상적 근거는 무엇인가?",
  similar_drugs:
    "동일 또는 유사 target/MOA 약물의 임상시험 결과는 무엇인가?",
  study_design:
    "유사 개발과제에서 어떤 population, endpoint 및 study design이 사용되었는가?",
  safety:
    "동일 또는 유사 mechanism/class에서 알려진 주요 safety finding은 무엇인가?",
};

export const evidenceCategories: EvidenceCategory[] = [
  "disease_landscape",
  "historical_benchmark",
  "target_moa",
  "similar_drugs",
  "study_design",
  "safety",
];

export function derivePubMedStrategies(
  assessment: Assessment,
): Record<EvidenceCategory, PubMedSearchStrategy> {
  const indication = fieldTerm(assessment.candidate.indication);
  const targetOrMoa = fieldTerm(publicSearchTerm(assessment));
  const phase = phaseExpression(assessment.candidate.targetClinicalPhase);

  return {
    disease_landscape: strategy(
      "disease_landscape",
      `${indication} AND ${diseaseLandscapeTerms(assessment.candidate.indication)}`,
    ),
    historical_benchmark: strategy(
      "historical_benchmark",
      `${indication} AND ${efficacyTerms(assessment.candidate.indication)}`,
    ),
    target_moa: strategy(
      "target_moa",
      `${indication} AND ${targetOrMoa}`,
    ),
    similar_drugs: strategy(
      "similar_drugs",
      `${targetOrMoa} AND (clinical trial[Title/Abstract] OR phase[Title/Abstract])`,
    ),
    study_design: strategy(
      "study_design",
      `${indication} AND ${phase} AND "clinical trial"[Title/Abstract]`,
    ),
    safety: strategy(
      "safety",
      `${targetOrMoa} AND (safety[Title/Abstract] OR toxicity[Title/Abstract] OR "adverse event"[Title/Abstract])`,
    ),
  };
}

export function buildPubMedApiQuery(strategy: PubMedSearchStrategy) {
  const filters: string[] = [];

  if (strategy.publicationTypes.length) {
    filters.push(
      `(${strategy.publicationTypes
        .map((type) => `"${escapeTerm(type)}"[Publication Type]`)
        .join(" OR ")})`,
    );
  }

  const dateRange = publicationDateRange(strategy);
  if (dateRange) {
    filters.push(
      `("${dateRange.start}"[Date - Publication] : "${dateRange.end}"[Date - Publication])`,
    );
  }

  return [strategy.query.trim(), ...filters]
    .filter(Boolean)
    .map((part) => `(${part})`)
    .join(" AND ");
}

function strategy(
  category: EvidenceCategory,
  query: string,
): PubMedSearchStrategy {
  return {
    category,
    query,
    datePreset: "all",
    publicationTypes: [],
  };
}

function isDermatologyIndication(indication: string) {
  const normalized = indication.toLowerCase();
  return (
    normalized.includes("atopic") || normalized.includes("dermatitis")
  );
}

function publicSearchTerm(assessment: Assessment) {
  return (
    assessment.candidate.target ||
    assessment.candidate.mechanismOfAction ||
    assessment.candidate.indication
  );
}

function diseaseLandscapeTerms(indication: string) {
  if (isDermatologyIndication(indication)) {
    return `(clinical trial[Title/Abstract] OR treatment[Title/Abstract] OR EASI[Title/Abstract] OR IGA[Title/Abstract])`;
  }
  return `(clinical trial[Title/Abstract] OR treatment[Title/Abstract])`;
}

function efficacyTerms(indication: string) {
  if (isDermatologyIndication(indication)) {
    return `(EASI[Title/Abstract] OR IGA[Title/Abstract] OR EASI-75[Title/Abstract] OR "Phase 2"[Title/Abstract])`;
  }
  return `(ORR[Title/Abstract] OR PFS[Title/Abstract] OR OS[Title/Abstract] OR "overall survival"[Title/Abstract] OR "progression-free survival"[Title/Abstract])`;
}

function fieldTerm(value: string) {
  return `"${escapeTerm(value)}"[Title/Abstract]`;
}

function escapeTerm(value: string) {
  return value.replaceAll('"', '\\"').trim();
}

function phaseExpression(phase: string) {
  const match = phase.match(/(\d)/);
  if (!match) return `phase[Title/Abstract]`;
  const number = match[1];
  const roman = number === "1" ? "I" : number === "2" ? "II" : "III";
  return `("phase ${number}"[Title/Abstract] OR "phase ${roman}"[Title/Abstract])`;
}

function publicationDateRange(strategy: PubMedSearchStrategy) {
  if (strategy.datePreset === "all") return null;
  const now = new Date();
  const end = strategy.customEndDate || formatDate(now);
  if (strategy.datePreset === "custom") {
    return strategy.customStartDate
      ? { start: normalizeDate(strategy.customStartDate), end: normalizeDate(end) }
      : null;
  }
  const years = strategy.datePreset === "last_5_years" ? 5 : 10;
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  return { start: formatDate(start), end: formatDate(now) };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "/");
}

function normalizeDate(value: string) {
  return value.replaceAll("-", "/");
}
