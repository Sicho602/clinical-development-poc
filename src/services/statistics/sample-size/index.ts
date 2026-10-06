import type { SampleSizeCalculator } from "@/domain/contracts";
import type { SampleSizeInput, SampleSizeResult } from "@/domain/models";

import { bioequivalence2x2 } from "./bioequivalence-2x2";
import { nonInferiorityBinary } from "./non-inferiority-binary";
import { nonInferiorityContinuous } from "./non-inferiority-continuous";
import { superiorityBinary } from "./superiority-binary";
import { superiorityContinuous } from "./superiority-continuous";

/**
 * Deterministic TypeScript sample-size engine.
 * Swap this implementation for an R/PASS adapter by keeping the same
 * SampleSizeCalculator contract and input/output types.
 */
export class DeterministicSampleSizeCalculator implements SampleSizeCalculator {
  readonly status = "ready" as const;

  calculate(input: SampleSizeInput): SampleSizeResult {
    switch (input.kind) {
      case "superiority_continuous":
        return superiorityContinuous(input);
      case "superiority_binary":
        return superiorityBinary(input);
      case "non_inferiority_continuous":
        return nonInferiorityContinuous(input);
      case "non_inferiority_binary":
        return nonInferiorityBinary(input);
      case "bioequivalence_2x2":
        return bioequivalence2x2(input);
    }
  }
}

export const sampleSizeCalculator = new DeterministicSampleSizeCalculator();

export function calculateSampleSize(input: SampleSizeInput): SampleSizeResult {
  return sampleSizeCalculator.calculate(input);
}

export {
  bioequivalence2x2,
  nonInferiorityBinary,
  nonInferiorityContinuous,
  superiorityBinary,
  superiorityContinuous,
};
