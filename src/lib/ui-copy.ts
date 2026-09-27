import type { AssessmentStatus, RequestType } from "@/domain/models";

export const systemCopy = {
  name: "임상개발 검토 시스템",
  subtitle: "근거 기반 임상개발 검토",
  workspace: "PoC",
} as const;

export const navCopy = {
  global: "전체 메뉴",
  currentAssessment: "현재 검토 과제",
  dashboard: "임상개발 검토 현황",
  newAssessment: "신규 검토 등록",
  knowledgeBase: "기준정보 관리",
  settings: "설정",
  overview: "검토 개요",
  landscape: "유사·경쟁 임상",
  evidence: "문헌 근거",
  matrix: "근거 비교표",
  benchmark: "기존 치료성과 기준",
  strategy: "임상개발 전략",
  feasibility: "수행 가능성 검토",
  report: "종합 검토 결과",
} as const;

export const pageGuides = {
  dashboard:
    "등록된 검토 과제의 진행상태를 확인하고, 기존 과제를 열거나 신규 검토를 등록합니다.",
  newAssessment:
    "후보물질, 적응증, 검토 임상단계와 핵심 검토사항을 입력하여 신규 검토 과제를 등록합니다.",
  overview:
    "검토 대상과 현재 진행단계를 확인하고, 다음 작업으로 이동합니다.",
  landscape:
    "ClinicalTrials.gov에서 유사 임상시험을 검색하고, 개발전략 수립에 참고할 임상시험을 선택합니다.",
  evidence:
    "PubMed에서 관련 문헌을 검색하고, 검토에 사용할 주요 문헌을 선택합니다.",
  review:
    "선택한 문헌에서 추출된 환자군, 시험설계 및 유효성 결과를 확인하고 담당자가 검토합니다.",
  validation:
    "추출 정확도를 검증하기 위한 화면입니다. 실제 검토 흐름에서는 담당자 검토 화면을 사용합니다.",
  matrix:
    "검토 완료된 문헌의 환자군, 시험설계 및 주요 유효성 결과를 비교합니다.",
  benchmark:
    "참고 임상시험과 검토 완료 문헌에서 확인된 평가변수를 기준으로, 개발전략에 사용할 기존 치료성과 지표를 선택합니다.",
  strategy:
    "유사 임상과 문헌 근거를 바탕으로 대상 환자군, 시험설계 및 평가변수를 검토합니다.",
  feasibility:
    "검토된 임상설계를 기준으로 예상 일정, 비용 및 수행 난이도를 검토합니다.",
  report:
    "임상개발 전략, 예상 일정·비용 및 주요 위험요인을 종합하여 검토 결과를 확인합니다.",
  knowledgeBase:
    "CRO 단가, 일정 가정 등 기준정보를 관리하는 화면입니다. 현재 PoC에서는 구조를 준비합니다.",
  settings:
    "시스템 표시와 작업 환경을 확인합니다. 현재 PoC에서는 기본 설정만 제공합니다.",
} as const;

export const assessmentLabels = {
  assessment: "검토 과제",
  assessmentId: "검토번호",
  candidate: "후보물질 / 제품",
  indication: "적응증",
  mechanismOfAction: "작용기전",
  target: "표적",
  modality: "치료제 유형",
  currentStage: "현재 개발단계",
  targetPhase: "검토 임상단계",
  geography: "개발 대상 국가",
  requestType: "검토 유형",
  requesterDepartment: "요청부서",
  requester: "요청자",
  owner: "검토 담당자",
  researchQuestion: "핵심 검토사항",
  createdDate: "등록일",
  updatedDate: "최종 수정일",
  status: "진행상태",
} as const;

export const clinicalTrialLabels = {
  searchStrategy: "검색 조건",
  apiMatched: "검색된 전체 임상",
  retrieved: "불러온 임상",
  displayed: "현재 표시 임상",
  referenceTrial: "참고 임상시험",
  selectedReferenceTrials: "선택한 참고 임상시험",
  trialDetail: "임상시험 상세",
  recruitmentStatus: "모집 상태",
  studyType: "시험 유형",
  intervention: "시험약 / 중재",
  primaryEndpoint: "일차 평가변수",
  secondaryEndpoint: "이차 평가변수",
  enrollment: "대상자 수",
  sponsor: "의뢰자",
} as const;

export const evidenceLabels = {
  evidence: "문헌 근거",
  evidenceCategory: "근거 유형",
  selectedEvidence: "선택 문헌",
  addToEvidence: "검토 문헌에 추가",
  extractEvidence: "주요 정보 추출",
  aiDraft: "AI 추출값",
  humanReview: "담당자 검토",
  approved: "검토 완료",
  rejected: "제외",
  sourceText: "근거 원문",
  notReported: "확인되지 않음",
  notExtracted: "미추출",
  notAvailable: "확인되지 않음",
} as const;

export const benchmarkLabels = {
  candidate: "기준 후보 문헌",
  include: "기준에 포함",
  exclude: "기준에서 제외",
  observedRange: "관찰 범위",
  approvedBenchmark: "확정 기준",
} as const;

export const strategyLabels = {
  proposedValue: "검토안",
  basis: "검토 근거",
  source: "출처",
  userInputRequired: "담당자 입력 필요",
  insufficientEvidence: "근거 부족",
  notCalculated: "미산출",
} as const;

export const requestTypeLabels: Record<RequestType, string> = {
  new_development: "신규 개발",
  in_licensing: "도입 검토",
  follow_up_study: "후속 임상",
  indication_expansion: "적응증 확대",
  development_strategy_review: "개발전략 검토",
  other: "기타",
};

export const requestTypeFormOptions = [
  { value: "New Development", label: requestTypeLabels.new_development },
  { value: "In-licensing", label: requestTypeLabels.in_licensing },
  { value: "Follow-up Study", label: requestTypeLabels.follow_up_study },
  {
    value: "Indication Expansion",
    label: requestTypeLabels.indication_expansion,
  },
  {
    value: "Development Strategy Review",
    label: requestTypeLabels.development_strategy_review,
  },
  { value: "Other", label: requestTypeLabels.other },
] as const;

export const assessmentStatusLabels: Record<AssessmentStatus, string> = {
  draft: "초안",
  searching: "자료 수집",
  analysis: "분석 중",
  clinical_review: "임상 검토",
  completed: "완료",
};

export const workflowSteps = [
  {
    id: "register",
    label: "검토 등록",
    href: (id: string) => `/assessments/${id}`,
  },
  {
    id: "landscape",
    label: "유사·경쟁 임상",
    href: (id: string) => `/assessments/${id}/search-strategy`,
  },
  {
    id: "evidence",
    label: "문헌 근거",
    href: (id: string) => `/assessments/${id}/evidence`,
  },
  {
    id: "benchmark",
    label: "기존 치료성과",
    href: (id: string) => `/assessments/${id}/benchmark`,
  },
  {
    id: "strategy",
    label: "임상개발 전략",
    href: (id: string) => `/assessments/${id}/development-strategy`,
  },
  {
    id: "feasibility",
    label: "일정·비용·난이도",
    href: (id: string) => `/assessments/${id}/feasibility`,
  },
  {
    id: "report",
    label: "종합 검토 결과",
    href: (id: string) => `/assessments/${id}/report`,
  },
] as const;

export type WorkflowStepId = (typeof workflowSteps)[number]["id"];

export function workflowStepFromPath(pathname: string): WorkflowStepId {
  if (pathname.includes("/search-strategy")) return "landscape";
  if (pathname.includes("/evidence")) return "evidence";
  if (pathname.includes("/benchmark")) return "benchmark";
  if (pathname.includes("/development-strategy")) return "strategy";
  if (pathname.includes("/feasibility")) return "feasibility";
  if (pathname.includes("/report")) return "report";
  return "register";
}

export const strategyFieldLabels = {
  target_phase: "검토 임상단계",
  target_population: "대상 환자군",
  line_of_therapy: "치료차수",
  study_design: "시험 설계",
  control_comparator: "대조군 / 비교군",
  primary_endpoint: "일차 평가변수",
  secondary_endpoints: "이차 평가변수",
  treatment_duration: "투여기간",
  target_geography: "개발 대상 국가",
  target_effect: "목표 치료효과",
  historical_benchmark: "기존 치료성과 기준",
  sample_size: "예상 대상자 수",
  key_assumptions: "주요 가정",
} as const;

export const strategySourceLabels = {
  assessment_input: "검토 등록 정보",
  reference_trial: "참고 임상시험",
  approved_evidence: "검토 완료 문헌",
  approved_benchmark: "확정된 기존 치료성과",
  user_input: "담당자 입력",
  rule: "시스템 규칙",
  ai_draft: "AI 검토안",
} as const;

export const strategyReviewStatusLabels = {
  draft: "검토 전",
  accepted: "수락",
  rejected: "제외",
} as const;

export const strategyStatusLabels = {
  draft: "검토 전",
  reviewed: "검토 완료",
  approved: "승인",
} as const;

export const strategyBasisCopy = {
  targetPhase: "신규 검토 등록 시 입력한 검토 임상단계를 적용했습니다.",
  targetPopulation:
    "등록된 적응증을 기준으로 설정했습니다. 세부 선정·제외기준 및 대상 환자군은 담당자 검토가 필요합니다.",
  noLineOfTherapy: "승인된 치료차수 근거가 없어 담당자 입력이 필요합니다.",
  multipleLineOfTherapy:
    "검토 완료 문헌에 치료차수 설명이 여러 건 있어 담당자 선택이 필요합니다.",
  approvedLineOfTherapy: (count: number) =>
    `검토 완료 문헌 ${count}건에서 동일한 치료차수가 확인되었습니다.`,
  noReferenceTrials:
    "선택된 참고 임상시험이 없어 시험설계 검토안이 생성되지 않았습니다.",
  noStudyDesignMetadata:
    "선택한 참고 임상시험에 정규화된 시험설계 정보가 부족합니다.",
  sharedStudyDesign: (count: number, total: number) =>
    `선택한 참고 임상시험 ${total}건 중 ${count}건이 동일한 시험설계 패턴을 사용합니다.`,
  noComparator:
    "선택한 참고 임상시험에서 일관된 대조군/비교군을 도출할 수 없어 담당자 입력이 필요합니다.",
  noPrimaryEndpoint:
    "선택한 참고 임상시험 또는 확정된 기존 치료성과에서 일차 평가변수가 확인되지 않았습니다.",
  noSecondaryUntilPrimary:
    "일차 평가변수가 정해지기 전에는 이차 평가변수 검토안을 만들지 않습니다.",
  primaryFromBenchmark:
    "담당자가 선택한 기존 치료성과 지표를 일차 평가변수 검토안으로 사용합니다. 평가시점은 지표와 함께 유지합니다.",
  secondaryFromBenchmark:
    "선택한 다른 기존 치료성과 지표를 이차 평가변수 후보로 표시합니다.",
  noSecondaryFromBenchmark:
    "이차 평가변수 후보로 사용할 추가 선택 지표가 없습니다.",
  primaryFromTrials: (count: number, total: number, label: string) =>
    `선택한 참고 임상시험 ${total}건 중 ${count}건이 ${label}을(를) 일차 평가변수로 사용합니다.`,
  secondaryFromTrials:
    "선택한 참고 임상시험의 다른 일차 평가변수를 이차 평가변수 후보로 표시합니다. 담당자 확인이 필요합니다.",
  noSecondaryFromTrials:
    "선택한 참고 임상시험에서 구분되는 이차 평가변수 후보가 확인되지 않았습니다.",
  noTreatmentDuration:
    "승인된 구조화 근거에서 투여기간을 확인할 수 없어 담당자 입력이 필요합니다.",
  targetGeography: "신규 검토 등록 시 입력한 개발 대상 국가를 적용했습니다.",
  noTargetGeography:
    "개발 대상 국가가 등록되지 않아 담당자 입력이 필요합니다.",
  targetEffect: (endpoint?: string | null) =>
    endpoint
      ? `${endpoint}에 대한 목표 치료효과는 담당자가 입력해야 합니다. 임의의 목표값은 생성하지 않습니다.`
      : "선택한 일차 평가변수에 대한 목표 치료효과는 담당자가 입력해야 합니다. 임의의 목표값은 생성하지 않습니다.",
  benchmarkNotApproved:
    "기존 치료성과 기준이 담당자 승인되기 전에는 사용할 수 없습니다.",
  benchmarkNoMetric: "확정된 기존 치료성과에 선택된 지표가 없습니다.",
  benchmarkSelected:
    "담당자가 선택한 기존 치료성과만 사용합니다. 평가시점과 환자군이 다른 결과는 합치지 않습니다.",
  sampleSize:
    "통계 산출 엔진이 연결되기 전에는 예상 대상자 수를 계산하지 않습니다.",
  keyAssumptionsValue:
    "대상 환자군, 치료차수, 평가변수 정의, 목표 치료효과, 대조군을 확정한 뒤 통계 설계를 진행해야 합니다.",
  keyAssumptionsBasis:
    "이 항목들이 정해지지 않으면 해석과 대상자 수 산출에 영향을 줍니다.",
  referenceTrialRequired: "참고 임상시험 선택 필요",
} as const;

export const missingValueCopy = {
  notCalculated: "미산출",
  notReported: "확인되지 않음",
  reviewRequired: "검토 필요",
  userInputRequired: "담당자 입력 필요",
  insufficientEvidence: "근거 부족",
} as const;
