import type {
  SampleSizeResult,
  SampleSizeSuperiorityBinaryInput,
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
 * Two-sample superiority test for proportions, unpooled alternative variance.
 *
 * n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α*} + z_{1-β})² / (pT − pC)²
 * n_T = r n_C
 *
 * Reference: Chow, Shao, Wang, §4.2.1 (two independent proportions,
 * without continuity correction).
 */
export function superiorityBinary(
  input: SampleSizeSuperiorityBinaryInput,
): SampleSizeResult {
  const invalid = validateInputShape(input);
  if (invalid) return invalid;

  const delta = input.treatmentRate - input.controlRate;
  if (delta === 0) {
    return fail(
      "zero_difference",
      "우월성 시험에서 시험군과 대조군 반응률이 같으면 표본수를 계산할 수 없습니다.",
    );
  }

  const treatmentVar =
    input.treatmentRate * (1 - input.treatmentRate);
  const controlVar = input.controlRate * (1 - input.controlRate);
  const { r, label } = allocationRatio(
    input.allocationTreatment,
    input.allocationControl,
  );
  const variance = treatmentVar / r + controlVar;
  if (variance <= 0) {
    return fail(
      "zero_variance",
      "반응률 분산이 0이어서 표본수를 계산할 수 없습니다.",
    );
  }

  const zAlpha = criticalZ(input.alpha, input.sides);
  const zBeta = powerZ(input.power);
  const rawControl = (variance * (zAlpha + zBeta) ** 2) / delta ** 2;
  const counts = applyAllocationAndDropout(rawControl, r, input.dropoutRate);

  return {
    ok: true,
    analysisType: "superiority",
    outcomeType: "binary",
    analysisN: counts.analysis,
    enrollmentN: counts.enrollment,
    crossover: null,
    diagnostics: {
      method: "두 군 비율 비교 (비합동 분산, 연속성 보정 없음)",
      formula:
        "n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α*} + z_{1-β})² / (pT − pC)²",
      hypothesis:
        input.sides === "two_sided"
          ? "H0: pT − pC = 0  vs  H1: pT − pC ≠ 0"
          : "H0: pT − pC = 0  vs  H1: pT − pC ≠ 0 (단측, |pT−pC| 기준)",
      alpha: input.alpha,
      sides: input.sides,
      zAlpha,
      zBeta,
      effect: delta,
      variance,
      rawN: rawControl * (1 + r),
      roundingRule: "군별 분석 N은 올림. 등록 N = ceil(분석 N / (1 − 탈락률)).",
      dropoutRate: input.dropoutRate,
      allocationRatio: label,
      notes: ["반응률은 비율(0–1)로 계산", "연속성 보정은 적용하지 않음"],
    },
  };
}
