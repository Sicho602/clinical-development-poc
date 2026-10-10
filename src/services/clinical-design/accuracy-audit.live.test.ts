import { describe, expect, it } from "vitest";

import { ClinicalTrialsClient } from "@/services/connectors/clinical-trials/clinical-trials-client";
import { extractClinicalDesignProfile } from "./extract-clinical-design";

const liveEnabled = process.env.CLINICAL_DESIGN_LIVE_TEST === "1";

const exampleNctIds = [
  "NCT07217015",
  "NCT06389136",
  "NCT07542483",
  "NCT06241118",
] as const;

describe.skipIf(!liveEnabled)("API vs extractor accuracy", () => {
  it("matches enrollment, endpoint, and comparator from the raw study", async () => {
    const client = new ClinicalTrialsClient();
    for (const nctId of exampleNctIds) {
      const raw = (await client.getRawStudy(nctId)) as {
        protocolSection?: {
          designModule?: {
            enrollmentInfo?: { count?: number; type?: string };
          };
          armsInterventionsModule?: {
            armGroups?: Array<{
              type?: string;
              interventionNames?: string[];
            }>;
          };
          outcomesModule?: {
            primaryOutcomes?: Array<{ measure?: string; timeFrame?: string }>;
          };
        };
      };
      const profile = extractClinicalDesignProfile(raw);
      const enrollment = raw.protocolSection?.designModule?.enrollmentInfo;
      const planned = profile.fields.find(
        (field) => field.key === "planned_sample_size",
      );
      const actual = profile.fields.find(
        (field) => field.key === "actual_enrollment",
      );
      if (enrollment?.type === "ESTIMATED") {
        expect(planned?.value).toBe(enrollment.count ?? null);
        expect(actual?.value).toBeNull();
      } else if (enrollment?.type === "ACTUAL") {
        expect(actual?.value).toBe(enrollment.count ?? null);
        expect(planned?.value).toBeNull();
      }

      const primary = (
        raw.protocolSection?.outcomesModule?.primaryOutcomes ?? []
      )
        .map((outcome) => outcome.measure)
        .filter((measure): measure is string => Boolean(measure));
      expect(
        profile.fields.find((field) => field.key === "primary_endpoint")?.value,
      ).toEqual(primary.length ? primary : null);

      const comparatorTypes = Array.from(
        new Set(
          (raw.protocolSection?.armsInterventionsModule?.armGroups ?? [])
            .map((arm) => arm.type)
            .filter(
              (type): type is string =>
                type === "PLACEBO_COMPARATOR" ||
                type === "ACTIVE_COMPARATOR" ||
                type === "SHAM_COMPARATOR" ||
                type === "NO_INTERVENTION",
            ),
        ),
      );
      expect(
        profile.fields.find((field) => field.key === "comparator_type")?.value,
      ).toEqual(comparatorTypes.length ? comparatorTypes : null);
    }
  }, 90_000);
});
