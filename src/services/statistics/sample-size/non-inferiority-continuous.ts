import type {
  SampleSizeResult,
  SampleSizeNonInferiorityContinuousInput,
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
 * Two-sample non-inferiority test for means, one-sided, common SD.
 *
 * Higher is better (UI margin Δ > 0):
 *   H0: μT − μC ≤ −Δ
 *   H1: μT − μC > −Δ
 *   effect = (μT − μC) + Δ
 *
 * Lower is better:
 *   H0: μT − μC ≥ +Δ
 *   H1: μT − μC < +Δ
 *   effect = Δ − (μT − μC)
 *
 * n_C = (1 + 1/r) σ² (z_{1-α} + z_{1-β})² / effect²
 *
 * Reference: Chow, Shao, Wang, §6.2; ICH E9 / E10 NI convention with a
 * positive clinical margin entered in the UI.
 */
export function nonInferiorityContinuous(
  input: SampleSizeNonInferiorityContinuousInput,
): SampleSizeResult {
  const invalid = validateInputShape(input);
  if (invalid) return invalid;
  if (
    !Number.isFinite(input.treatmentMean) ||
    !Number.isFinite(input.controlMean)
  ) {
    return fail("missing_means", "시험군·대조군 평균을 입력하세요.");
  }

  const observed = input.treatmentMean - input.controlMean;
  const effect =
    input.direction === "higher"
      ? observed + input.margin
      : input.margin - observed;

  if (!(effect > 0)) {
    return fail(
      "ni_not_testable",
      "현재 예상 차이와 비열등성 한계 조합에서는 비열등성을 입증할 수 없습니다.",
    );
  }

  const { r, label } = allocationRatio(
    input.allocationTreatment,
    input.allocationControl,
  );
  const zAlpha = criticalZ(input.alpha, "one_sided");
  const zBeta = powerZ(input.power);
  const variance = input.sd * input.sd;
  const rawControl =
    ((1 + 1 / r) * variance * (zAlpha + zBeta) ** 2) / effect ** 2;
  const counts = applyAllocationAndDropout(rawControl, r, input.dropoutRate);
  const delta = input.margin;

  return {
    ok: true,
    analysisType: "non_inferiority",
    outcomeType: "continuous",
    analysisN: counts.analysis,
    enrollmentN: counts.enrollment,
    crossover: null,
    diagnostics: {
      method: "두 군 평균 비열등성 (단측, 공통 SD)",
      formula:
        "n_C = (1 + 1/r) σ² (z_{1-α} + z_{1-β})² / effect², effect = δ ± Δ",
      hypothesis:
        input.direction === "higher"
          ? `H0: μT − μC ≤ −${delta}  vs  H1: μT − μC > −${delta}`
          : `H0: μT − μC ≥ +${delta}  vs  H1: μT − μC < +${delta}`,
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
        input.direction === "higher"
          ? "값이 클수록 유리. UI 한계 Δ는 양수로 입력"
          : "값이 작을수록 유리. UI 한계 Δ는 양수로 입력",
        `예상 군간 차이 μT−μC = ${observed}`,
      ],
    },
  };
}
