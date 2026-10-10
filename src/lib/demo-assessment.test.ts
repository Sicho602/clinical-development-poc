import { describe, expect, it } from "vitest";

import { buildDemoAssessment } from "./demo-assessment";
import type { Assessment } from "@/domain/models";

describe("DEMO assessment preservation", () => {
  it("does not clear selected reference trials on profile refresh", () => {
    const existing = {
      id: "ASSESS-2026-001",
      selectedReferenceTrialIds: ["NCT06389136", "NCT07217015"],
      selectedPublicationPmids: ["12345678"],
      createdAt: "2026-01-01T00:00:00.000Z",
      researchQuestion: {
        id: "q",
        text: "existing",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    } as Assessment;
    const next = buildDemoAssessment(existing, { resetLinked: false });
    expect(next.selectedReferenceTrialIds).toEqual([
      "NCT06389136",
      "NCT07217015",
    ]);
    expect(next.selectedPublicationPmids).toEqual(["12345678"]);
  });
});
