import type {
  Assessment,
  ClinicalTrialsServerSearchStrategy,
} from "@/domain/models";
import { recordHasMojibake } from "@/lib/encoding";
import { LocalStorageAssessmentRepository } from "@/repositories/browser/assessment-repository";
import { LocalStorageDevelopmentStrategyRepository } from "@/repositories/browser/development-strategy-repository";
import { LocalStorageEvidenceExtractionRepository } from "@/repositories/browser/evidence-extraction-repository";
import { LocalStorageExtractionValidationRepository } from "@/repositories/browser/extraction-validation-repository";
import { LocalStorageHistoricalBenchmarkRepository } from "@/repositories/browser/historical-benchmark-repository";
import { LocalStoragePublicationSelectionRepository } from "@/repositories/browser/publication-selection-repository";
import { LocalStorageReferenceTrialRepository } from "@/repositories/browser/reference-trial-repository";
import { LocalStorageSearchLogRepository } from "@/repositories/browser/search-log-repository";

export const DEMO_ASSESSMENT_ID = "ASSESS-2026-001";

export const DEMO_ASSESSMENT_TITLE =
  "[DEMO] 아토피피부염 Phase 2 임상개발 검토";

export const DEMO_CANDIDATE_NAME = "CDX-101 (DEMO)";

export const DEMO_DISCLAIMER =
  "본 과제는 시스템 기능 확인을 위한 가상 예시이며, 실제 회사 개발과제 또는 개발전략을 의미하지 않습니다.";

export const DEMO_CANDIDATE_NOTE =
  "CDX-101은 시스템 시연을 위한 가상 후보물질이며 실제 회사 파이프라인을 의미하지 않습니다.";

const DEMO_PROFILE_VERSION = "atopic-tyk2-generic-metrics-v1";
const DEMO_PROFILE_KEY = "cde:demo-profile-version";
const STRATEGY_COPY_VERSION = "ko-ui-v1";
const STRATEGY_COPY_KEY = "cde:strategy-copy-version";

export const demoAssessmentResearchQuestion =
  "중등도–중증 아토피피부염 성인 환자를 대상으로 CDX-101의 Phase 2 임상개발 가능성을 검토하고, 유사·경쟁 임상의 환자군, 시험설계, 평가변수 및 대상자 규모를 비교하여 개발전략을 수립한다. 예상 임상 일정, 비용 및 수행 난이도를 함께 검토한다.";

export function isDemoAssessment(assessmentId?: string | null) {
  return assessmentId === DEMO_ASSESSMENT_ID;
}

export function assessmentDisplayTitle(
  assessmentId: string,
  candidateName?: string,
) {
  if (isDemoAssessment(assessmentId)) {
    return DEMO_ASSESSMENT_TITLE;
  }
  return candidateName ?? assessmentId;
}

export function buildDemoAssessment(
  existing?: Assessment | null,
  options?: { resetLinked?: boolean },
): Assessment {
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? now;
  const resetLinked = options?.resetLinked ?? false;
  const assessment: Assessment = {
    id: DEMO_ASSESSMENT_ID,
    candidate: {
      id: `${DEMO_ASSESSMENT_ID}:candidate`,
      name: DEMO_CANDIDATE_NAME,
      indication: "Atopic Dermatitis",
      mechanismOfAction: "Selective TYK2 inhibition",
      target: "TYK2",
      modality: "Small Molecule",
      currentDevelopmentStage: "Phase 1 Completed",
      targetClinicalPhase: "Phase 2",
      targetGeographies: ["Korea", "United States"],
    },
    researchQuestion: {
      id: `${DEMO_ASSESSMENT_ID}:question`,
      text: demoAssessmentResearchQuestion,
      createdAt: existing?.researchQuestion.createdAt ?? createdAt,
    },
    requestType: "new_development",
    requesterDepartment: "Demo Research Team",
    requester: "Demo Requester",
    owner: "Demo Clinical Reviewer",
    status: existing?.status ?? "draft",
    currentVersion: existing?.currentVersion ?? "v0.1",
    reviewStatus: existing?.reviewStatus ?? "ai_draft",
    selectedReferenceTrialIds: resetLinked
      ? []
      : (existing?.selectedReferenceTrialIds ?? []),
    selectedPublicationPmids: resetLinked
      ? []
      : (existing?.selectedPublicationPmids ?? []),
    createdAt,
    updatedAt: now,
    createdBy: existing?.createdBy ?? "Demo Requester",
    updatedBy: "Demo Requester",
  };
  assessment.clinicalTrialsSearchStrategy =
    !resetLinked && existing?.clinicalTrialsSearchStrategy
      ? existing.clinicalTrialsSearchStrategy
      : demoClinicalTrialsStrategy();
  return assessment;
}

export function demoClinicalTrialsStrategy(): ClinicalTrialsServerSearchStrategy {
  return {
    condition: "Atopic Dermatitis",
    phases: ["PHASE2"],
    studyTypes: ["INTERVENTIONAL"],
    statuses: ["RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED"],
    interventionTypes: ["DRUG"],
    intervention: "",
    sponsor: "",
    country: "",
    ageGroups: ["ADULT"],
    sex: "ALL",
    keyword: "TYK2",
  };
}

export async function ensureDemoAssessment() {
  if (typeof window === "undefined") return null;
  const repository = new LocalStorageAssessmentRepository();
  const existing = await repository.getById(DEMO_ASSESSMENT_ID);
  const profile = window.localStorage.getItem(DEMO_PROFILE_KEY);
  const resetLinked = profile !== DEMO_PROFILE_VERSION;
  if (resetLinked) {
    await clearDemoLinkedData();
    window.localStorage.setItem(DEMO_PROFILE_KEY, DEMO_PROFILE_VERSION);
  }
  const demo = buildDemoAssessment(existing, { resetLinked });
  await resetDemoStrategyCopy();
  return repository.update(demo);
}

export async function resetDemoStrategyCopy() {
  if (typeof window === "undefined") return;
  const strategyRepository = new LocalStorageDevelopmentStrategyRepository();
  const saved = await strategyRepository.getByAssessmentId(DEMO_ASSESSMENT_ID);
  const copyVersion = window.localStorage.getItem(STRATEGY_COPY_KEY);
  if (copyVersion !== STRATEGY_COPY_VERSION || recordHasMojibake(saved)) {
    await strategyRepository.clear(DEMO_ASSESSMENT_ID);
    window.localStorage.setItem(STRATEGY_COPY_KEY, STRATEGY_COPY_VERSION);
  }
}

async function clearDemoLinkedData() {
  await Promise.all([
    new LocalStorageReferenceTrialRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStoragePublicationSelectionRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStorageSearchLogRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStorageEvidenceExtractionRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStorageExtractionValidationRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStorageHistoricalBenchmarkRepository().clear(DEMO_ASSESSMENT_ID),
    new LocalStorageDevelopmentStrategyRepository().clear(DEMO_ASSESSMENT_ID),
  ]);
}
