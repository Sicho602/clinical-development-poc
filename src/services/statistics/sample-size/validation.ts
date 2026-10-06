import type { SampleSizeFailure, SampleSizeInput } from "@/domain/models";

import { fail } from "./common";

export function validateCommonAssumptions(input: {
  alpha: number;
  power: number;
  dropoutRate: number;
  allocationTreatment?: number;
  allocationControl?: number;
}): SampleSizeFailure | null {
  if (!(input.alpha > 0 && input.alpha < 1)) {
    return fail("invalid_alpha", "유의수준 Alpha는 0과 1 사이여야 합니다.");
  }
  if (!(input.power > 0 && input.power < 1)) {
    return fail("invalid_power", "검정력은 0과 1 사이여야 합니다.");
  }
  if (!(input.dropoutRate >= 0 && input.dropoutRate < 1)) {
    return fail("invalid_dropout", "탈락률은 0% 이상 100% 미만이어야 합니다.");
  }
  if (
    input.allocationTreatment !== undefined &&
    input.allocationControl !== undefined
  ) {
    if (
      !(input.allocationTreatment > 0) ||
      !(input.allocationControl > 0)
    ) {
      return fail("invalid_allocation", "배정비는 0보다 커야 합니다.");
    }
  }
  return null;
}

export function validateRate(rate: number, label: string): SampleSizeFailure | null {
  if (!(rate >= 0 && rate <= 1)) {
    return fail(
      "invalid_rate",
      `${label}은(는) 0%에서 100% 사이여야 합니다.`,
    );
  }
  return null;
}

export function validatePositive(value: number, label: string): SampleSizeFailure | null {
  if (!(value > 0)) {
    return fail("invalid_positive", `${label}은(는) 0보다 커야 합니다.`);
  }
  return null;
}

export function validateInputShape(
  input: SampleSizeInput,
): SampleSizeFailure | null {
  switch (input.kind) {
    case "superiority_continuous":
      return validateCommonAssumptions(input) ?? validatePositive(input.sd, "표준편차");
    case "superiority_binary":
      return (
        validateCommonAssumptions(input) ??
        validateRate(input.treatmentRate, "시험군 반응률") ??
        validateRate(input.controlRate, "대조군 반응률")
      );
    case "non_inferiority_continuous":
      return (
        validateCommonAssumptions(input) ??
        validatePositive(input.sd, "표준편차") ??
        validatePositive(input.margin, "비열등성 한계")
      );
    case "non_inferiority_binary":
      return (
        validateCommonAssumptions(input) ??
        validateRate(input.treatmentRate, "시험군 반응률") ??
        validateRate(input.controlRate, "대조군 반응률") ??
        validatePositive(input.margin, "비열등성 한계") ??
        (input.margin >= 1
          ? fail(
              "invalid_margin",
              "비열등성 한계는 %p 기준이며 100%p 미만이어야 합니다.",
            )
          : null)
      );
    case "bioequivalence_2x2":
      return (
        validateCommonAssumptions({
          alpha: input.alpha,
          power: input.power,
          dropoutRate: input.dropoutRate,
        }) ??
        validatePositive(input.expectedGmr, "기하평균비") ??
        validatePositive(input.intraSubjectCv, "개체 내 CV") ??
        validatePositive(input.lowerLimit, "BE 하한") ??
        validatePositive(input.upperLimit, "BE 상한") ??
        (input.lowerLimit >= input.upperLimit
          ? fail("invalid_be_limits", "BE 하한은 상한보다 작아야 합니다.")
          : null)
      );
  }
}
