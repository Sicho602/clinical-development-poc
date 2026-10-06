import { describe, expect, it } from "vitest";

import { calculateSampleSize } from "./index";
import {
  standardNormalCdf,
  standardNormalQuantile,
  studentTQuantile,
} from "./distributions";

describe("distributions", () => {
  it("matches published normal quantiles", () => {
    expect(standardNormalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(standardNormalQuantile(0.8)).toBeCloseTo(0.841621, 4);
    expect(standardNormalQuantile(0.95)).toBeCloseTo(1.644854, 5);
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 6);
  });

  it("matches published t quantiles closely", () => {
    expect(studentTQuantile(0.95, 18)).toBeCloseTo(1.7341, 2);
    expect(studentTQuantile(0.95, 16)).toBeCloseTo(1.7459, 2);
  });
});

describe("superiority continuous", () => {
  it("matches Chow two-mean example: δ=2, σ=4, α=0.05 two-sided, 80%", () => {
    const result = calculateSampleSize({
      kind: "superiority_continuous",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      meanEntryMode: "means",
      treatmentMean: 12,
      controlMean: 10,
      sd: 4,
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0.1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysisN?.treatment).toBe(63);
    expect(result.analysisN?.control).toBe(63);
    expect(result.analysisN?.total).toBe(126);
    expect(result.enrollmentN?.treatment).toBe(70);
    expect(result.enrollmentN?.control).toBe(70);
    expect(result.enrollmentN?.total).toBe(140);
  });

  it("accepts expected difference instead of means", () => {
    const result = calculateSampleSize({
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysisN?.total).toBe(126);
  });
});

describe("superiority binary", () => {
  it("matches unpooled 50% vs 30% example", () => {
    const result = calculateSampleSize({
      kind: "superiority_binary",
      sides: "two_sided",
      alpha: 0.05,
      power: 0.8,
      treatmentRate: 0.5,
      controlRate: 0.3,
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0.1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysisN?.treatment).toBe(91);
    expect(result.analysisN?.control).toBe(91);
    expect(result.enrollmentN?.treatment).toBe(102);
  });
});

describe("non-inferiority continuous", () => {
  it("matches higher-is-better Δ=2, equal means, σ=4, α=0.025", () => {
    const result = calculateSampleSize({
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysisN?.treatment).toBe(63);
    expect(result.analysisN?.total).toBe(126);
    expect(result.diagnostics.hypothesis).toContain("≤ −2");
  });

  it("rejects an untestable NI configuration", () => {
    const result = calculateSampleSize({
      kind: "non_inferiority_continuous",
      alpha: 0.025,
      power: 0.8,
      treatmentMean: 6,
      controlMean: 10,
      margin: 2,
      sd: 4,
      direction: "higher",
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ni_not_testable");
  });
});

describe("non-inferiority binary", () => {
  it("matches 70% vs 75%, 10%p margin, higher is better", () => {
    const result = calculateSampleSize({
      kind: "non_inferiority_binary",
      alpha: 0.025,
      power: 0.8,
      treatmentRate: 0.7,
      controlRate: 0.75,
      margin: 0.1,
      direction: "higher",
      allocationTreatment: 1,
      allocationControl: 1,
      dropoutRate: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysisN?.treatment).toBe(1248);
    expect(result.analysisN?.control).toBe(1248);
  });
});

describe("bioequivalence 2x2", () => {
  it("matches Diletti even n=20 for CV 20%, GMR 0.95, 80–125%, 80% power", () => {
    const result = calculateSampleSize({
      kind: "bioequivalence_2x2",
      pkParameter: "AUC",
      expectedGmr: 0.95,
      intraSubjectCv: 0.2,
      power: 0.8,
      alpha: 0.05,
      lowerLimit: 0.8,
      upperLimit: 1.25,
      dropoutRate: 0.1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.crossover?.completers).toBe(20);
    expect(result.crossover?.sequenceTR).toBe(10);
    expect(result.crossover?.sequenceRT).toBe(10);
    expect(result.crossover?.enrollment).toBe(24);
    expect(result.achievedPower ?? 0).toBeGreaterThanOrEqual(0.8);
  });
});

describe("validation", () => {
  it("rejects invalid alpha, SD, rates, and BE limits", () => {
    expect(
      calculateSampleSize({
        kind: "superiority_continuous",
        sides: "two_sided",
        alpha: 0,
        power: 0.8,
        meanEntryMode: "difference",
        expectedDifference: 2,
        sd: 4,
        allocationTreatment: 1,
        allocationControl: 1,
        dropoutRate: 0,
      }).ok,
    ).toBe(false);

    expect(
      calculateSampleSize({
        kind: "superiority_continuous",
        sides: "two_sided",
        alpha: 0.05,
        power: 0.8,
        meanEntryMode: "difference",
        expectedDifference: 2,
        sd: 0,
        allocationTreatment: 1,
        allocationControl: 1,
        dropoutRate: 0,
      }).ok,
    ).toBe(false);

    expect(
      calculateSampleSize({
        kind: "superiority_binary",
        sides: "two_sided",
        alpha: 0.05,
        power: 0.8,
        treatmentRate: 1.2,
        controlRate: 0.3,
        allocationTreatment: 1,
        allocationControl: 1,
        dropoutRate: 0,
      }).ok,
    ).toBe(false);

    expect(
      calculateSampleSize({
        kind: "bioequivalence_2x2",
        pkParameter: "Cmax",
        expectedGmr: 0.95,
        intraSubjectCv: 0.2,
        power: 0.8,
        alpha: 0.05,
        lowerLimit: 1.25,
        upperLimit: 0.8,
        dropoutRate: 0,
      }).ok,
    ).toBe(false);
  });
});
