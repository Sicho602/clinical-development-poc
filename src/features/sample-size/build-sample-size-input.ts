import type { SampleSizeInput } from "@/domain/models";

import type { SampleSizeFormState } from "./sample-size-defaults";

export function buildSampleSizeInput(form: SampleSizeFormState): SampleSizeInput {
  const alpha = parseRequired(form.alpha);
  const power = parseRequired(form.power);
  const dropoutRate = parseRequired(form.dropoutPct) / 100;
  const allocationTreatment = parseRequired(form.allocationTreatment);
  const allocationControl = parseRequired(form.allocationControl);

  if (form.analysisType === "bioequivalence") {
    return {
      kind: "bioequivalence_2x2",
      pkParameter: form.pkParameter,
      expectedGmr: parseRequired(form.expectedGmr),
      intraSubjectCv: parseRequired(form.intraSubjectCvPct) / 100,
      power,
      alpha,
      lowerLimit: parseRequired(form.beLower),
      upperLimit: parseRequired(form.beUpper),
      dropoutRate,
    };
  }

  if (form.analysisType === "superiority" && form.outcomeType === "continuous") {
    return {
      kind: "superiority_continuous",
      sides: form.sides,
      alpha,
      power,
      meanEntryMode: form.meanEntryMode,
      treatmentMean: numberOrUndefined(form.treatmentMean),
      controlMean: numberOrUndefined(form.controlMean),
      expectedDifference: numberOrUndefined(form.expectedDifference),
      sd: parseRequired(form.sd),
      allocationTreatment,
      allocationControl,
      dropoutRate,
    };
  }

  if (form.analysisType === "superiority") {
    return {
      kind: "superiority_binary",
      sides: form.sides,
      alpha,
      power,
      treatmentRate: parseRequired(form.treatmentRatePct) / 100,
      controlRate: parseRequired(form.controlRatePct) / 100,
      allocationTreatment,
      allocationControl,
      dropoutRate,
    };
  }

  if (form.outcomeType === "continuous") {
    return {
      kind: "non_inferiority_continuous",
      alpha,
      power,
      treatmentMean: parseRequired(form.treatmentMean),
      controlMean: parseRequired(form.controlMean),
      margin: parseRequired(form.margin),
      sd: parseRequired(form.sd),
      direction: form.direction,
      allocationTreatment,
      allocationControl,
      dropoutRate,
    };
  }

  return {
    kind: "non_inferiority_binary",
    alpha,
    power,
    treatmentRate: parseRequired(form.treatmentRatePct) / 100,
    controlRate: parseRequired(form.controlRatePct) / 100,
    margin: parseRequired(form.margin) / 100,
    direction: form.direction,
    allocationTreatment,
    allocationControl,
    dropoutRate,
  };
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRequired(value: string): number {
  if (value.trim() === "") return Number.NaN;
  return Number(value);
}
