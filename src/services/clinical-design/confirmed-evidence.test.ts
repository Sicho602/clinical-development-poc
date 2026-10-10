import { describe, expect, it } from "vitest";

import type { SourcedDesignField } from "@/domain/models";
import {
  classifyValueChange,
  confirmedDesignValue,
  isConfirmedDesignField,
} from "./confirmed-evidence";

function field(
  overrides: Partial<SourcedDesignField>,
): SourcedDesignField {
  return {
    key: "planned_sample_size",
    value: 200,
    source: {
      nctId: "NCT00000000",
      apiField: "test",
      url: "https://clinicaltrials.gov/study/NCT00000000",
    },
    extractionMethod: "api",
    reviewStatus: "approved",
    reviewedValue: 200,
    ...overrides,
  };
}

describe("classifyValueChange", () => {
  it("treats case and array order as unchanged", () => {
    expect(classifyValueChange("Atopic Dermatitis", "atopic dermatitis")).toBe(
      "none",
    );
    expect(classifyValueChange(["Japan", "United States"], ["United States", "Japan"])).toBe(
      "none",
    );
  });

  it("treats punctuation-only edits as formal", () => {
    expect(classifyValueChange("EASI 90", "EASI-90")).toBe("formal");
    expect(classifyValueChange("At Week 8", "Week 8")).toBe("formal");
  });

  it("treats numeric or meaning changes as substantive", () => {
    expect(classifyValueChange(200, 240)).toBe("substantive");
    expect(
      classifyValueChange("Atopic Dermatitis", "Nummular Eczema"),
    ).toBe("substantive");
  });
});

describe("confirmed design evidence", () => {
  it("excludes re-review required fields from matrix/benchmark/AI evidence", () => {
    const approved = field({ reviewStatus: "approved" });
    const pending = field({
      reviewStatus: "re_review_required",
      reviewedValue: 200,
      value: 240,
    });
    expect(isConfirmedDesignField(approved)).toBe(true);
    expect(confirmedDesignValue(approved)).toBe(200);
    expect(isConfirmedDesignField(pending)).toBe(false);
    expect(confirmedDesignValue(pending)).toBeNull();
  });
});
