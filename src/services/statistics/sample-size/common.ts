import type {
  SampleSizeArmCounts,
  SampleSizeFailure,
  SampleSizeTestSides,
} from "@/domain/models";

import { standardNormalQuantile } from "./distributions";

export function fail(code: string, message: string): SampleSizeFailure {
  return { ok: false, code, message };
}

export function criticalZ(alpha: number, sides: SampleSizeTestSides): number {
  const tail = sides === "two_sided" ? 1 - alpha / 2 : 1 - alpha;
  return standardNormalQuantile(tail);
}

export function powerZ(power: number): number {
  return standardNormalQuantile(power);
}

export function allocationRatio(
  treatment: number,
  control: number,
): { r: number; label: string } {
  return {
    r: treatment / control,
    label: `${formatRatioPart(treatment)}:${formatRatioPart(control)}`,
  };
}

export function ceilPositive(value: number): number {
  return Math.max(1, Math.ceil(value - 1e-12));
}

export function applyAllocationAndDropout(
  rawControl: number,
  r: number,
  dropoutRate: number,
): { analysis: SampleSizeArmCounts; enrollment: SampleSizeArmCounts } {
  const rawTreatment = r * rawControl;
  const analysis = {
    treatment: ceilPositive(rawTreatment),
    control: ceilPositive(rawControl),
    total: 0,
  };
  analysis.total = analysis.treatment + analysis.control;

  const retain = 1 - dropoutRate;
  const enrollment = {
    treatment: ceilPositive(analysis.treatment / retain),
    control: ceilPositive(analysis.control / retain),
    total: 0,
  };
  enrollment.total = enrollment.treatment + enrollment.control;
  return { analysis, enrollment };
}

export function evenCeil(value: number): number {
  const rounded = ceilPositive(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function formatRatioPart(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
