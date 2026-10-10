import type {
  ClinicalDesignDomain,
  ClinicalDesignFieldKey,
} from "@/domain/models";

export interface ClinicalDesignFieldDefinition {
  key: ClinicalDesignFieldKey;
  domain: ClinicalDesignDomain;
  label: string;
}

export const clinicalDesignFields = [
  { key: "indication", domain: "population", label: "적응증" },
  { key: "age", domain: "population", label: "연령" },
  { key: "sex", domain: "population", label: "성별" },
  { key: "disease_severity", domain: "population", label: "중증도" },
  {
    key: "prior_treatment_requirements",
    domain: "population",
    label: "이전 치료 조건",
  },
  { key: "treatment_line", domain: "population", label: "치료차수" },
  {
    key: "key_inclusion_criteria",
    domain: "eligibility",
    label: "주요 선정기준",
  },
  {
    key: "key_exclusion_criteria",
    domain: "eligibility",
    label: "주요 제외기준",
  },
  {
    key: "washout_requirements",
    domain: "eligibility",
    label: "Washout 요건",
  },
  {
    key: "investigational_treatment",
    domain: "treatment",
    label: "시험약 / 중재",
  },
  { key: "dose", domain: "treatment", label: "용량" },
  { key: "route", domain: "treatment", label: "투여경로" },
  { key: "dosing_frequency", domain: "treatment", label: "투여주기" },
  { key: "comparator_type", domain: "treatment", label: "대조군 유형" },
  { key: "comparator_treatment", domain: "treatment", label: "대조 치료" },
  { key: "background_therapy", domain: "treatment", label: "병용 / 배경치료" },
  { key: "rescue_medication", domain: "treatment", label: "구조약물" },
  { key: "randomization", domain: "treatment", label: "무작위배정" },
  { key: "allocation_ratio", domain: "treatment", label: "배정비" },
  { key: "masking", domain: "treatment", label: "눈가림" },
  { key: "intervention_model", domain: "treatment", label: "시험 설계" },
  { key: "number_of_arms", domain: "treatment", label: "군 수" },
  { key: "primary_endpoint", domain: "endpoint", label: "일차 평가변수" },
  { key: "secondary_endpoints", domain: "endpoint", label: "이차 평가변수" },
  { key: "endpoint_definition", domain: "endpoint", label: "평가변수 정의" },
  { key: "endpoint_type", domain: "endpoint", label: "평가변수 유형" },
  {
    key: "assessment_timepoint",
    domain: "timepoint",
    label: "평가 시점",
  },
  {
    key: "planned_sample_size",
    domain: "sample_size",
    label: "계획 표본수",
  },
  {
    key: "actual_enrollment",
    domain: "sample_size",
    label: "실제 등록 표본수",
  },
  { key: "enrollment_type", domain: "sample_size", label: "등록 구분" },
  { key: "study_start_date", domain: "study_duration", label: "시험 시작일" },
  {
    key: "primary_completion_date",
    domain: "study_duration",
    label: "일차 완료일",
  },
  {
    key: "study_completion_date",
    domain: "study_duration",
    label: "시험 완료일",
  },
  {
    key: "treatment_duration",
    domain: "study_duration",
    label: "투여기간",
  },
  {
    key: "follow_up_duration",
    domain: "study_duration",
    label: "추적기간",
  },
  { key: "study_status", domain: "enrollment", label: "시험 상태" },
  { key: "phase", domain: "enrollment", label: "임상단계" },
  { key: "study_type", domain: "enrollment", label: "시험 유형" },
  { key: "sponsor", domain: "enrollment", label: "의뢰자" },
  { key: "countries", domain: "enrollment", label: "국가" },
  { key: "number_of_sites", domain: "enrollment", label: "기관 수" },
  {
    key: "statistical_hypothesis",
    domain: "statistical",
    label: "통계 가설",
  },
  { key: "alpha", domain: "statistical", label: "유의수준 (α)" },
  { key: "power", domain: "statistical", label: "검정력" },
  {
    key: "effect_size_assumption",
    domain: "statistical",
    label: "효과크기 가정",
  },
  {
    key: "analysis_population",
    domain: "statistical",
    label: "분석군",
  },
  { key: "arm_level_results", domain: "results", label: "군별 결과" },
  { key: "adverse_events", domain: "results", label: "이상반응" },
] as const satisfies readonly ClinicalDesignFieldDefinition[];

export const clinicalDesignDomainLabels: Record<ClinicalDesignDomain, string> =
  {
    population: "환자군",
    eligibility: "선정·제외기준",
    treatment: "시험약 / 대조군",
    endpoint: "평가변수",
    timepoint: "평가 시점",
    sample_size: "표본수",
    study_duration: "시험 기간",
    enrollment: "등록 / 수행",
    statistical: "통계 설계",
    results: "결과",
  };

export const designAutomationStatusLabels: Record<
  import("@/domain/models").DesignAutomationStatus,
  string
> = {
  not_started: "Not Started",
  processing: "Processing",
  completed: "Completed",
  review_required: "Review Required",
  failed: "Failed",
};

export const designAiStatusLabels: Record<
  import("@/domain/models").DesignAiStatus,
  string
> = {
  not_executed: "AI 분석 미실행",
  mock: "Mock 결과",
  completed: "AI 분석 완료",
  failed: "AI 분석 실패",
};

export const designReviewStatusLabels: Record<
  import("@/domain/models").DesignFieldReviewStatus | "mixed",
  string
> = {
  not_reviewed: "검토 전",
  approved: "승인",
  edited: "수정 후 승인",
  rejected: "제외",
  re_review_required: "재검토 필요",
  mixed: "일부 검토",
};
