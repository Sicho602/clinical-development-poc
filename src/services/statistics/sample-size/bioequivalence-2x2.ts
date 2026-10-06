import type {
  SampleSizeBioequivalenceInput,
  SampleSizeResult,
} from "@/domain/models";

import { evenCeil, fail, powerZ } from "./common";
import { standardNormalCdf, studentTQuantile } from "./distributions";
import { validateInputShape } from "./validation";

/**
 * Average bioequivalence for a 2×2 crossover, log-scale TOST.
 *
 * σ_w² = ln(1 + CV²),  se(μ̂T − μ̂R) = σ_w √(2/n)
 * n = total completers, df = n − 2.
 *
 * Stopping rule uses both published approximations and takes the more
 * conservative even n:
 *   1) Phillips-style TOST power with t critical value
 *      Φ((θU − μ)/se − t_{1-α,df}) − Φ((θL − μ)/se + t_{1-α,df})
 *   2) Julious / Chow–Wang binding-bound rule
 *      min(μ − θL, θU − μ) / se ≥ t_{1-α,df} + t_{1-β,df}
 *
 * Φ-only overestimates power versus Owen's Q (PASS / PowerTOST / Diletti).
 * Requiring both criteria removes that underestimation at 90% power while
 * keeping Diletti 80% cells after even rounding.
 *
 * Reference: Diletti, Hauschke, Steinijans (1991); Julious (2004);
 * Chow & Liu; FDA average BE, 80.00–125.00%.
 */
export function bioequivalence2x2(
  input: SampleSizeBioequivalenceInput,
): SampleSizeResult {
  const invalid = validateInputShape(input);
  if (invalid) return invalid;

  const thetaL = Math.log(input.lowerLimit);
  const thetaU = Math.log(input.upperLimit);
  const mu = Math.log(input.expectedGmr);
  if (!(thetaL < mu && mu < thetaU)) {
    return fail(
      "gmr_outside_limits",
      "예상 기하평균비가 BE 수용 범위 안에 있어야 표본수를 계산할 수 있습니다.",
    );
  }

  const sigma2 = Math.log(1 + input.intraSubjectCv ** 2);
  const sigmaW = Math.sqrt(sigma2);
  const zBeta = powerZ(input.power);
  const bind = Math.min(mu - thetaL, thetaU - mu);
  let chosenN = 0;
  let achievedPower = 0;
  let tCritical = 0;

  for (let n = 4; n <= 20_000; n += 2) {
    const df = n - 2;
    const se = sigmaW * Math.sqrt(2 / n);
    const tAlpha = studentTQuantile(1 - input.alpha, df);
    const tBeta = studentTQuantile(input.power, df);
    const phiPower =
      standardNormalCdf((thetaU - mu) / se - tAlpha) -
      standardNormalCdf((thetaL - mu) / se + tAlpha);
    const juliousOk = se <= bind / (tAlpha + tBeta);
    if (phiPower >= input.power && juliousOk) {
      chosenN = n;
      achievedPower = phiPower;
      tCritical = tAlpha;
      break;
    }
  }

  if (!chosenN) {
    return fail(
      "be_n_not_found",
      "현재 가정에서는 20,000명 이내에서 목표 검정력에 도달하지 못했습니다.",
    );
  }

  const retain = 1 - input.dropoutRate;
  const enrollment = evenCeil(chosenN / retain);
  const sequence = chosenN / 2;
  const sequenceEnroll = enrollment / 2;

  return {
    ok: true,
    analysisType: "bioequivalence",
    outcomeType: "pk",
    analysisN: null,
    enrollmentN: null,
    crossover: {
      completers: chosenN,
      sequenceTR: sequence,
      sequenceRT: sequence,
      enrollment,
      sequenceTREnrollment: sequenceEnroll,
      sequenceRTEnrollment: sequenceEnroll,
    },
    achievedPower,
    diagnostics: {
      method: `2×2 crossover TOST (${input.pkParameter}, log 변환)`,
      formula:
        "σ_w² = ln(1+CV²), se = σ_w√(2/n); n is the smallest even N satisfying both Φ-TOST power and (bind/se) ≥ t_{1−α,df}+t_{1−β,df}",
      hypothesis: `H0: μT−μR ≤ ln(${input.lowerLimit}) 또는 μT−μR ≥ ln(${input.upperLimit})  vs  H1: ln(${input.lowerLimit}) < μT−μR < ln(${input.upperLimit})`,
      alpha: input.alpha,
      sides: "one_sided",
      zAlpha: tCritical,
      zBeta,
      tCritical,
      degreesOfFreedom: chosenN - 2,
      effect: mu,
      variance: sigma2,
      rawN: chosenN,
      roundingRule:
        "분석 N은 짝수 올림(TR/RT 균형). 등록 N = evenCeil(분석 N / (1 − 탈락률)).",
      dropoutRate: input.dropoutRate,
      allocationRatio: "1:1 (TR/RT)",
      notes: [
        `${100 * (1 - 2 * input.alpha)}% CI TOST`,
        `GMR = ${input.expectedGmr}, CV = ${(input.intraSubjectCv * 100).toFixed(1)}%`,
        `수용 범위 ${input.lowerLimit}–${input.upperLimit}`,
      ],
    },
  };
}
