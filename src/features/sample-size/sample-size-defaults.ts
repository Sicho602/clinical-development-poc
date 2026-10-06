import type { SampleSizeAnalysisType, SampleSizeOutcomeType } from "@/domain/models";

export interface SampleSizeFormState {
  analysisType: SampleSizeAnalysisType;
  outcomeType: SampleSizeOutcomeType;
  sides: "one_sided" | "two_sided";
  alpha: string;
  power: string;
  meanEntryMode: "means" | "difference";
  treatmentMean: string;
  controlMean: string;
  expectedDifference: string;
  sd: string;
  treatmentRatePct: string;
  controlRatePct: string;
  margin: string;
  direction: "higher" | "lower";
  allocationTreatment: string;
  allocationControl: string;
  dropoutPct: string;
  pkParameter: "AUC" | "Cmax";
  expectedGmr: string;
  intraSubjectCvPct: string;
  beLower: string;
  beUpper: string;
  scenarioName: string;
}

export function emptySampleSizeForm(): SampleSizeFormState {
  return {
    analysisType: "superiority",
    outcomeType: "continuous",
    sides: "two_sided",
    alpha: "0.05",
    power: "0.80",
    meanEntryMode: "means",
    treatmentMean: "",
    controlMean: "",
    expectedDifference: "",
    sd: "",
    treatmentRatePct: "",
    controlRatePct: "",
    margin: "",
    direction: "higher",
    allocationTreatment: "1",
    allocationControl: "1",
    dropoutPct: "10",
    pkParameter: "AUC",
    expectedGmr: "0.95",
    intraSubjectCvPct: "20",
    beLower: "0.80",
    beUpper: "1.25",
    scenarioName: "",
  };
}

export function demoSampleSizeForm(): SampleSizeFormState {
  return {
    ...emptySampleSizeForm(),
    treatmentMean: "12",
    controlMean: "10",
    expectedDifference: "2",
    sd: "4",
    treatmentRatePct: "50",
    controlRatePct: "30",
    margin: "2",
    scenarioName: "DEMO 우월성 연속형",
  };
}
