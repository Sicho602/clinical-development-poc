import type {
  Assessment,
  ClinicalTrialInterventionType,
  ClinicalTrialPhase,
  ClinicalTrialsServerSearchStrategy,
} from "@/domain/models";
import {
  demoClinicalTrialsStrategy,
  isDemoAssessment,
} from "@/lib/demo-assessment";

export function deriveClinicalTrialsStrategy(
  assessment: Assessment,
): ClinicalTrialsServerSearchStrategy {
  if (isDemoAssessment(assessment.id)) {
    return demoClinicalTrialsStrategy();
  }

  const phase = mapPhase(assessment.candidate.targetClinicalPhase);
  const interventionType = mapModality(assessment.candidate.modality);

  return {
    condition: assessment.candidate.indication,
    phases: phase ? [phase] : [],
    studyTypes: ["INTERVENTIONAL"],
    statuses: ["RECRUITING", "ACTIVE_NOT_RECRUITING", "COMPLETED"],
    interventionTypes: interventionType ? [interventionType] : [],
    intervention: "",
    sponsor: "",
    country: "",
    ageGroups: [],
    sex: "ALL",
    keyword: "",
  };
}

function mapPhase(value: string): ClinicalTrialPhase | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("phase 4")) return "PHASE4";
  if (normalized.includes("phase 3")) return "PHASE3";
  if (normalized.includes("phase 2")) return "PHASE2";
  if (normalized.includes("phase 1")) return "PHASE1";
  return null;
}

function mapModality(
  value?: string,
): ClinicalTrialInterventionType | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("small molecule")) return "DRUG";
  if (
    normalized.includes("antibody") ||
    normalized.includes("adc") ||
    normalized.includes("cell therapy") ||
    normalized.includes("gene therapy")
  ) {
    return "BIOLOGICAL";
  }
  return null;
}
