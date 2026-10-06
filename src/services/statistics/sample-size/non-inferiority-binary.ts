import type {
  SampleSizeResult,
  SampleSizeNonInferiorityBinaryInput,
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
 * Two-sample non-inferiority test for proportions, one-sided.
 *
 * Margin Δ is an absolute rate difference (percentage points as a proportion).
 *
 * Higher response is better:
 *   H0: pT − pC ≤ −Δ
 *   H1: pT − pC > −Δ
 *   effect = (pT − pC) + Δ
 *
 * Lower event rate is better:
 *   H0: pT − pC ≥ +Δ
 *   H1: pT − pC < +Δ
 *   effect = Δ − (pT − pC)
 *
 * n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α} + z_{1-β})² / effect²
 *
 * Reference: Chow, Shao, Wang, §4.2.3; Blackwelder (1982).
 */
export function nonInferiorityBinary(
  input: SampleSizeNonInferiorityBinaryInput,
): SampleSizeResult {
  const invalid = validateInputShape(input);
  if (invalid) return invalid;

  const observed = input.treatmentRate - input.controlRate;
  const effect =
    input.direction === "higher"
      ? observed + input.margin
      : input.margin - observed;

  if (!(effect > 0)) {
    return fail(
      "ni_not_testable",
      "현재 예상 반응률 차이와 비열등성 한계 조합에서는 비열등성을 입증할 수 없습니다.",
    );
  }

  const { r, label } = allocationRatio(
    input.allocationTreatment,
    input.allocationControl,
  );
  const variance =
    input.treatmentRate * (1 - input.treatmentRate) / r +
    input.controlRate * (1 - input.controlRate);
  if (variance <= 0) {
    return fail(
      "zero_variance",
      "반응률 분산이 0이어서 표본수를 계산할 수 없습니다.",
    );
  }

  const zAlpha = criticalZ(input.alpha, "one_sided");
  const zBeta = powerZ(input.power);
  const rawControl = (variance * (zAlpha + zBeta) ** 2) / effect ** 2;
  const counts = applyAllocationAndDropout(rawControl, r, input.dropoutRate);
  const marginPp = input.margin * 100;

  return {
    ok: true,
    analysisType: "non_inferiority",
    outcomeType: "binary",
    analysisN: counts.analysis,
    enrollmentN: counts.enrollment,
    crossover: null,
    diagnostics: {
      method: "두 군 비율 비열등성 (단측, 비합동 분산)",
      formula:
        "n_C = (pT(1-pT)/r + pC(1-pC)) (z_{1-α} + z_{1-β})² / effect²",
      hypothesis:
        input.direction === "higher"
          ? `H0: pT − pC ≤ −${input.margin}  vs  H1: pT − pC > −${input.margin}`
          : `H0: pT − pC ≥ +${input.margin}  vs  H1: pT − pC < +${input.margin}`,
      alpha: input.alpha,
      sides: "one_sided",
      zAlpha,
      zBeta,
      effect,
      variance,
      rawN: rawControl * (1 + r),
      roundingRule: "군별 분석 N은 올림. 등록 N = ceil(분석 N / (1 − 탈락률)).",
      dropoutRate: input.dropoutRate,
      allocationRatio: label,
      notes: [
        `비열등성 한계 ${marginPp} %p (절대 반응률 차이)`,
        input.direction === "higher"
          ? "반응이 높을수록 유리"
          : "사건률이 낮을수록 유리",
      ],
    },
  };
}
