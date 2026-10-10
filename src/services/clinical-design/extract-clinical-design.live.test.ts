import { describe, expect, it } from "vitest";

import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { extractClinicalDesignProfile } from "./extract-clinical-design";

const liveEnabled = process.env.CLINICAL_DESIGN_LIVE_TEST === "1";

describe.skipIf(!liveEnabled)("live ClinicalTrials.gov design extraction", () => {
  it("extracts a public study without inventing statistical values", async () => {
    const client = new ClinicalTrialsClient();
    const raw = await client.getRawStudy("NCT06389136");
    expect(raw).toBeTruthy();
    const profile = extractClinicalDesignProfile(raw);
    expect(profile.nctId).toBe("NCT06389136");
    expect(profile.fields.find((field) => field.key === "sponsor")?.value).toBe(
      "AbbVie",
    );
    expect(profile.fields.find((field) => field.key === "alpha")?.value).toBeNull();
    expect(
      profile.fields.find((field) => field.key === "planned_sample_size")?.value,
    ).toBeTypeOf("number");
  }, 30_000);
});
