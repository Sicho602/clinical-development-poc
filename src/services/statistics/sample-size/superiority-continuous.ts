import type {
  SampleSizeResult,
  SampleSizeSuperiorityContinuousInput,
} from "@/domain/models";

import {
  allocationRatio,
  applyAllocationAndDropout,
  criticalZ,
  fail,
  powerZ,
} from "./common";
import { validateInputShape } from "./validation";

/**
 * Two-sample superiority test for means, common SD, normal approximation.
 *
 * n_C = (1 + 1/r) σ² (z_{1-α*} + z_{1-β})² / δ²
 * n_T = r n_C
 * α* = α/2 if two-sided, α if one-sided.
 *
 * Reference: Chow, Shao, Wang, Sample Size Calculations in Clinical Research,
 * 2nd ed., §3.1.1 (two-sample z/t approximation with equal variance).
 */
export function superiorityContinuous(
  input: SampleSizeSuperiorityContinuousInput,
): SampleSizeResult {
  const invalid = validateInputShape(input);
  if (invalid) return invalid;

  const difference =
    input.meanEntryMode === "difference"
      ? input.expectedDifference
      : input.treatmentMean !== undefined && input.controlMean !== undefined
        ? input.treatmentMean - input.controlMean
        : undefined;

  if (difference === undefined || !Number.isFinite(difference)) {
    return fail(
      "missing_difference",
      "시험군·대조군 평균 또는 예상 군간 차이를 입력하세요.",
    );
  }
  if (difference === 0) {
    return fail(
      "zero_difference",
      "우월성 시험에서 예상 군간 차이는 0이 될 수 없습니다.",
    );
  }

  const { r, label } = allocationRatio(
    input.allocationTreatment,
    input.allocationControl,
  );
  const zAlpha = criticalZ(input.alpha, input.sides);
  const zBeta = powerZ(input.power);
  const delta = Math.abs(difference);
  const variance = input.sd * input.sd;
  const rawControl =
    ((1 + 1 / r) * variance * (zAlpha + zBeta) ** 2) / delta ** 2;
  const counts = applyAllocationAndDropout(rawControl, r, input.dropoutRate);

  return {
    ok: true,
    analysisType: "superiority",
    outcomeType: "continuous",
    analysisN: counts.analysis,
    enrollmentN: counts.enrollment,
    crossover: null,
    diagnostics: {
      method: "두 군 평균 비교 (공통 SD, 정규근사)",
      formula:
        "n_C = (1 + 1/r) σ² (z_{1-α*} + z_{1-β})² / δ², n_T = r n_C",
      hypothesis:
        input.sides === "two_sided"
          ? "H0: μT − μC = 0  vs  H1: μT − μC ≠ 0"
          : "H0: μT − μC = 0  vs  H1: μT − μC ≠ 0 (단측, |δ| 기준)",
      alpha: input.alpha,
      sides: input.sides,
      zAlpha,
      zBeta,
      effect: difference,
      variance,
      rawN: rawControl * (1 + r),
      roundingRule: "군별 분석 N은 올림. 등록 N = ceil(분석 N / (1 − 탈락률)).",
      dropoutRate: input.dropoutRate,
      allocationRatio: label,
      notes: [
        "공통 표준편차 가정",
        input.meanEntryMode === "difference"
          ? "예상 군간 차이 직접 입력"
          : "시험군 평균 − 대조군 평균",
      ],
    },
  };
}
