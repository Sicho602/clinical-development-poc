/**
 * Standard normal and Student-t helpers for deterministic sample-size formulas.
 *
 * Normal quantile: Peter J. Acklam rational approximation.
 * Normal CDF: Abramowitz & Stegun 7.1.26 via erf.
 * t quantile: Cornish–Fisher expansion from the normal quantile.
 *
 * These are numerical approximations, not LLM estimates. Accuracy is checked
 * in unit tests against published constants.
 */

export function standardNormalQuantile(probability: number): number {
  if (probability <= 0 || probability >= 1) {
    throw new Error("Normal quantile is defined only for 0 < p < 1.");
  }

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577509590705e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (probability < pLow) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (probability <= pHigh) {
    const q = probability - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  const q = Math.sqrt(-2 * Math.log(1 - probability));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export function standardNormalCdf(z: number): number {
  return 0.5 * (1 + errorFunction(z / Math.SQRT2));
}

export function studentTQuantile(probability: number, df: number): number {
  if (probability <= 0 || probability >= 1) {
    throw new Error("t quantile is defined only for 0 < p < 1.");
  }
  if (!Number.isFinite(df) || df <= 0) {
    throw new Error("t degrees of freedom must be positive.");
  }
  if (df > 1000) {
    return standardNormalQuantile(probability);
  }

  const z = standardNormalQuantile(probability);
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;
  const g1 = (z3 + z) / (4 * df);
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df);
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df * df * df);
  return z + g1 + g2 + g3;
}

function errorFunction(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-abs * abs));
  return sign * y;
}
