import { describe, expect, it } from "vitest";

import { calculateSampleSize } from "./index";
import type { SampleSizeInput, SampleSizeSuccess } from "@/domain/models";

/**
 * Published constants. These are NOT taken from the implementation.
 * z values: Abramowitz & Stegun / NIST standard normal tables.
 */
const Z_975 = 1.959963984540054;
const Z_95 = 1.6448536269514722;
const Z_90 = 1.2815515655446004;
const Z_80 = 0.841621233572914;

function ceilN(value: number) {
  return Math.max(1, Math.ceil(value - 1e-12));
}

function independentContinuousN(
  delta: number,
  sd: number,
  zAlpha: number,
  zBeta: number,
  r = 1,
) {
  const rawControl =
    ((1 + 1 / r) * sd * sd * (zAlpha + zBeta) ** 2) / delta ** 2;
  return {
    rawControl,
    control: ceilN(rawControl),
    treatment: ceilN(r * rawControl),
  };
}

function independentBinaryUnpooledN(
  pT: number,
  pC: number,
  effect: number,
  zAlpha: number,
  zBeta: number,
  r = 1,
) {
  const variance = (pT * (1 - pT)) / r + pC * (1 - pC);
  const rawControl = (variance * (zAlpha + zBeta) ** 2) / effect ** 2;
  return {
    variance,
    rawControl,
    control: ceilN(rawControl),
    treatment: ceilN(r * rawControl),
  };
}

function analysisN(input: SampleSizeInput) {
  const result = calculateSampleSize(input);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}

function perGroup(result: SampleSizeSuccess) {
  return result.analysisN?.control ?? Number.NaN;
}

describe("independent QC: superiority continuous", () => {
  it("δ=2, σ=4, two-sided 0.05, 80%, 1:1 → 63 (Chow z), not PASS t=64", () => {
    const expected = independentContinuousN(2, 4, Z_975, Z_80);
    expect(expected.rawControl).toBeCloseTo(62.791, 2);
    expect(expected.control).toBe(63);
    const result = analysisN({
      kind: "superiority_continuous",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      meanEntryMode: "difference",
      expectedDifference: 2,
      sd: 4,
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(perGroup(result)).toBe(expected.control);
    expect(result.diagnostics.zAlpha).toBeCloseTo(Z_975, 4);
    expect(result.diagnostics.zBeta).toBeCloseTo(Z_80, 4);
  });

  it("same design at 90% power", () => {
    const expected = independentContinuousN(2, 4, Z_975, Z_90);
    expect(expected.control).toBe(85);
    expect(
      perGroup(
        analysisN({
          kind: "superiority_continuous",
          sides: "two_sided",
          alpha: 0.05,
          power: 0.9,
          meanEntryMode: "difference",
          expectedDifference: 2,
          sd: 4,
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(85);
  });

  it("2:1 allocation", () => {
    const expected = independentContinuousN(2, 4, Z_975, Z_80, 2);
    expect(expected.control).toBe(48);
    expect(expected.treatment).toBe(95);
    const result = analysisN({
      kind: "superiority_continuous",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      meanEntryMode: "difference",
      expectedDifference: 2,
      sd: 4,
      allocationTreatment: 2,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(result.analysisN?.control).toBe(48);
    expect(result.analysisN?.treatment).toBe(95);
  });
});

describe("independent QC: superiority binary", () => {
  it("50% vs 30% unpooled → 91; Fleiss would be 93", () => {
    const expected = independentBinaryUnpooledN(0.5, 0.3, 0.2, Z_975, Z_80);
    expect(expected.rawControl).toBeCloseTo(90.262, 2);
    expect(expected.control).toBe(91);
    const fleiss =
      (Z_975 * Math.sqrt(2 * 0.4 * 0.6) + Z_80 * Math.sqrt(0.25 + 0.21)) **
        2 /
      0.04;
    expect(Math.ceil(fleiss - 1e-12)).toBe(93);
    expect(
      perGroup(
        analysisN({
          kind: "superiority_binary",
          sides: "two_sided",
          alpha: 0.05,
          power: 0.8,
          treatmentRate: 0.5,
          controlRate: 0.3,
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(91);
  });

  it("50% vs 30% at 90% power", () => {
    expect(
      independentBinaryUnpooledN(0.5, 0.3, 0.2, Z_975, Z_90).control,
    ).toBe(121);
    expect(
      perGroup(
        analysisN({
          kind: "superiority_binary",
          sides: "two_sided",
          alpha: 0.05,
          power: 0.9,
          treatmentRate: 0.5,
          controlRate: 0.3,
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(121);
  });

  it("60% vs 40% changes variance at the same difference", () => {
    expect(
      independentBinaryUnpooledN(0.6, 0.4, 0.2, Z_975, Z_80).control,
    ).toBe(95);
    expect(
      perGroup(
        analysisN({
          kind: "superiority_binary",
          sides: "two_sided",
          alpha: 0.05,
          power: 0.8,
          treatmentRate: 0.6,
          controlRate: 0.4,
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(95);
  });
});

describe("independent QC: non-inferiority continuous", () => {
  it("equal means, Δ=2, σ=4, one-sided 0.025, 80%", () => {
    const expected = independentContinuousN(2, 4, Z_975, Z_80);
    expect(expected.control).toBe(63);
    const result = analysisN({
      kind: "non_inferiority_continuous",
      alpha: 0.025,
      power: 0.8,
      treatmentMean: 10,
      controlMean: 10,
      margin: 2,
      sd: 4,
      direction: "higher",
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(perGroup(result)).toBe(63);
    expect(result.diagnostics.sides).toBe("one_sided");
    expect(result.diagnostics.zAlpha).toBeCloseTo(Z_975, 4);
  });

  it("treatment better by 1, Δ=2 → effect 3", () => {
    expect(independentContinuousN(3, 4, Z_975, Z_80).control).toBe(28);
    expect(
      perGroup(
        analysisN({
          kind: "non_inferiority_continuous",
          alpha: 0.025,
          power: 0.8,
          treatmentMean: 11,
          controlMean: 10,
          margin: 2,
          sd: 4,
          direction: "higher",
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(28);
  });

  it("lower-is-better direction", () => {
    expect(independentContinuousN(5, 5, Z_975, Z_80).control).toBe(16);
    expect(
      perGroup(
        analysisN({
          kind: "non_inferiority_continuous",
          alpha: 0.025,
          power: 0.8,
          treatmentMean: 8,
          controlMean: 10,
          margin: 3,
          sd: 5,
          direction: "lower",
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(16);
  });
});

describe("independent QC: non-inferiority binary", () => {
  it("recomputes 70% vs 75%, 10%p from first principles", () => {
    const pT = 0.7;
    const pC = 0.75;
    const margin = 0.1;
    const observed = pT - pC;
    const effect = observed + margin;
    expect(observed).toBeCloseTo(-0.05, 12);
    expect(effect).toBeCloseTo(0.05, 12);
    const expected = independentBinaryUnpooledN(pT, pC, effect, Z_975, Z_80);
    expect(expected.variance).toBeCloseTo(0.3975, 6);
    expect(expected.rawControl).toBeCloseTo(1247.972, 2);
    expect(expected.control).toBe(1248);

    const result = analysisN({
      kind: "non_inferiority_binary",
      alpha: 0.025,
      power: 0.8,
      treatmentRate: pT,
      controlRate: pC,
      margin,
      direction: "higher",
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(perGroup(result)).toBe(1248);
    expect(result.diagnostics.effect).toBeCloseTo(0.05, 12);
    expect(result.diagnostics.zAlpha).toBeCloseTo(Z_975, 4);
  });

  it("wider 15%p margin reduces N", () => {
    expect(
      independentBinaryUnpooledN(0.7, 0.75, 0.1, Z_975, Z_80).control,
    ).toBe(312);
    expect(
      perGroup(
        analysisN({
          kind: "non_inferiority_binary",
          alpha: 0.025,
          power: 0.8,
          treatmentRate: 0.7,
          controlRate: 0.75,
          margin: 0.15,
          direction: "higher",
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(312);
  });

  it("matches published 85% vs 85%, 10%p → 201", () => {
    expect(
      independentBinaryUnpooledN(0.85, 0.85, 0.1, Z_975, Z_80).control,
    ).toBe(201);
    expect(
      perGroup(
        analysisN({
          kind: "non_inferiority_binary",
          alpha: 0.025,
          power: 0.8,
          treatmentRate: 0.85,
          controlRate: 0.85,
          margin: 0.1,
          direction: "higher",
          allocationTreatment: 1,
          allocationControl: 1,
          dropoutRate: 0,
        }),
      ),
    ).toBe(201);
  });
});

describe("independent QC: bioequivalence vs Diletti 1991 / PowerTOST", () => {
  function beN(gmr: number, cv: number, power: number) {
    const result = analysisN({
      kind: "bioequivalence_2x2",
      pkParameter: "AUC",
      expectedGmr: gmr,
      intraSubjectCv: cv,
      power,
      alpha: 0.05,
      lowerLimit: 0.8,
      upperLimit: 1.25,
      dropoutRate: 0,
    });
    return result.crossover?.completers ?? Number.NaN;
  }

  it("CV 20%, GMR 0.95, 80%: Diletti 19 → even 20", () => {
    expect(beN(0.95, 0.2, 0.8)).toBe(20);
  });

  it("CV 20%, GMR 1.00, 80%: Diletti 16", () => {
    expect(beN(1, 0.2, 0.8)).toBe(16);
  });

  it("CV 15%, GMR 0.95, 80%: Diletti 12", () => {
    expect(beN(0.95, 0.15, 0.8)).toBe(12);
  });

  it("CV 10%, GMR 0.95, 80%: Diletti 7 → even 8", () => {
    expect(beN(0.95, 0.1, 0.8)).toBe(8);
  });

  it("CV 30%, GMR 0.95, 80%: Diletti 39 → even 40", () => {
    expect(beN(0.95, 0.3, 0.8)).toBe(40);
  });

  it("CV 20%, GMR 0.95, 90%: Diletti/PowerTOST 26", () => {
    expect(beN(0.95, 0.2, 0.9)).toBe(26);
  });

  it("CV 40%, GMR 0.95, 80%: PowerTOST published 66", () => {
    expect(beN(0.95, 0.4, 0.8)).toBe(66);
  });
});

describe("independent QC: dropout and alpha tails", () => {
  it("applies ceil(N / (1-d)) per arm", () => {
    const result = analysisN({
      kind: "superiority_continuous",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      meanEntryMode: "difference",
      expectedDifference: 2,
      sd: 4,
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0.1,
    });
    expect(result.analysisN?.control).toBe(63);
    expect(result.enrollmentN?.control).toBe(ceilN(63 / 0.9));
    expect(result.enrollmentN?.control).toBe(70);
  });

  it("two-sided 0.05 uses z_0.975; NI 0.025 uses the same tail z", () => {
    const sup = analysisN({
      kind: "superiority_continuous",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      meanEntryMode: "difference",
      expectedDifference: 2,
      sd: 4,
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    const ni = analysisN({
      kind: "non_inferiority_continuous",
      alpha: 0.025,
      power: 0.8,
      treatmentMean: 10,
      controlMean: 10,
      margin: 2,
      sd: 4,
      direction: "higher",
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(sup.diagnostics.zAlpha).toBeCloseTo(ni.diagnostics.zAlpha, 8);
    expect(sup.diagnostics.zAlpha).toBeCloseTo(Z_975, 4);
  });

  it("BE alpha 0.05 is TOST one-sided, not two-sided 0.05", () => {
    const result = analysisN({
      kind: "bioequivalence_2x2",
      pkParameter: "AUC",
      expectedGmr: 0.95,
      intraSubjectCv: 0.2,
      power: 0.8,
      alpha: 0.05,
      lowerLimit: 0.8,
      upperLimit: 1.25,
      dropoutRate: 0,
    });
    expect(result.diagnostics.notes.some((note) => note.includes("90%"))).toBe(
      true,
    );
    expect(result.diagnostics.tCritical).toBeGreaterThan(Z_95);
  });
});
