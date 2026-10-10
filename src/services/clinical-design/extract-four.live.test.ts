import { describe, expect, it } from "vitest";

import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { buildClinicalDesignComparison } from "./compare-clinical-design";
import { extractClinicalDesignProfile } from "./extract-clinical-design";

const liveEnabled = process.env.CLINICAL_DESIGN_LIVE_TEST === "1";
const exampleNctIds = [
  "NCT07217015",
  "NCT06389136",
  "NCT07542483",
  "NCT06241118",
];

describe.skipIf(!liveEnabled)("live multi-trial design comparison", () => {
  it("collects four public studies and compares without AI claims", async () => {
    const client = new ClinicalTrialsClient();
    const profiles = [];
    for (const nctId of exampleNctIds) {
      const raw = await client.getRawStudy(nctId);
      expect(raw, nctId).toBeTruthy();
      const profile = extractClinicalDesignProfile(raw);
      expect(profile.nctId).toBe(nctId);
      expect(profile.fields.find((field) => field.key === "alpha")?.value).toBeNull();
      profiles.push(profile);
    }
    const comparison = buildClinicalDesignComparison({
      assessmentId: "ASSESS-LIVE",
      profiles,
    });
    expect(comparison.nctIds).toEqual(exampleNctIds);
    expect(comparison.aiStatus).toBe("not_executed");
    expect(
      comparison.rows.some((row) => row.differenceKind === "different"),
    ).toBe(true);
  }, 90_000);
});
