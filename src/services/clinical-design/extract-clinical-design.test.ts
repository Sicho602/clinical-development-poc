import { describe, expect, it } from "vitest";

import {
  applyDesignFieldReview,
  buildClinicalDesignComparison,
} from "./compare-clinical-design";
import {
  confirmedDesignValue,
  isConfirmedDesignField,
} from "./confirmed-evidence";
import { extractClinicalDesignProfile } from "./extract-clinical-design";
import { parseEligibilityCriteria } from "./parse-eligibility";

const fixtureStudy = {
  hasResults: false,
  protocolSection: {
    identificationModule: {
      nctId: "NCT06389136",
      briefTitle: "A Study of Upadacitinib in Adult Participants",
      officialTitle:
        "A Phase 3b/4 Randomized, Open-label, Efficacy Assessor-Blinded Study",
    },
    statusModule: {
      overallStatus: "RECRUITING",
      startDateStruct: { date: "2024-06-14", type: "ACTUAL" },
      primaryCompletionDateStruct: { date: "2026-08", type: "ESTIMATED" },
      completionDateStruct: { date: "2027-03", type: "ESTIMATED" },
    },
    sponsorCollaboratorsModule: {
      leadSponsor: { name: "AbbVie" },
    },
    designModule: {
      studyType: "INTERVENTIONAL",
      phases: ["PHASE3"],
      designInfo: {
        allocation: "RANDOMIZED",
        interventionModel: "SEQUENTIAL",
        primaryPurpose: "TREATMENT",
        maskingInfo: { masking: "NONE" },
      },
      enrollmentInfo: { count: 200, type: "ESTIMATED" },
    },
    conditionsModule: { conditions: ["Atopic Dermatitis"] },
    armsInterventionsModule: {
      armGroups: [
        {
          label: "Upadacitinib",
          type: "EXPERIMENTAL",
          interventionNames: ["Drug: Upadacitinib 15mg Dose"],
        },
        {
          label: "Dupilumab",
          type: "EXPERIMENTAL",
          interventionNames: ["Drug: Dupilumab 300mg Dose"],
        },
      ],
      interventions: [
        {
          name: "Upadacitinib 15mg Dose",
          description: "Oral tablet",
        },
        {
          name: "Dupilumab 300mg Dose",
          description: "Subcutaneous (SC) injection",
        },
      ],
    },
    outcomesModule: {
      primaryOutcomes: [
        {
          measure: "Participants who achieve EASI 90",
          description: "The EASI is a validated measure.",
          timeFrame: "At Week 8",
        },
      ],
      secondaryOutcomes: [
        {
          measure: "WP-NRS 0/1",
          timeFrame: "At Week 8",
        },
      ],
    },
    eligibilityModule: {
      eligibilityCriteria:
        "Inclusion Criteria:\n\n* Chronic AD with onset of symptoms at least 3 years.\n* EASI score >= 12.\n\nExclusion Criteria:\n\n* Other active skin diseases requiring systemic treatment.",
      sex: "ALL",
      minimumAge: "18 Years",
      maximumAge: "63 Years",
    },
    contactsLocationsModule: {
      locations: [
        { facility: "Site A", country: "United States" },
        { facility: "Site B", country: "United States" },
        { facility: "Site C", country: "Japan" },
      ],
    },
  },
};

function fieldValue(
  profile: ReturnType<typeof extractClinicalDesignProfile>,
  key: string,
) {
  return profile.fields.find((field) => field.key === key);
}

describe("parseEligibilityCriteria", () => {
  it("splits inclusion and exclusion without inventing items", () => {
    const parsed = parseEligibilityCriteria(
      fixtureStudy.protocolSection.eligibilityModule.eligibilityCriteria,
    );
    expect(parsed.inclusion).toEqual([
      "Chronic AD with onset of symptoms at least 3 years.",
      "EASI score >= 12.",
    ]);
    expect(parsed.exclusion).toEqual([
      "Other active skin diseases requiring systemic treatment.",
    ]);
  });
});

describe("extractClinicalDesignProfile", () => {
  it("extracts structured ClinicalTrials.gov fields without inventing values", () => {
    const profile = extractClinicalDesignProfile(fixtureStudy);
    expect(profile.nctId).toBe("NCT06389136");
    expect(fieldValue(profile, "sponsor")?.value).toBe("AbbVie");
    expect(fieldValue(profile, "planned_sample_size")?.value).toBe(200);
    expect(fieldValue(profile, "actual_enrollment")?.value).toBeNull();
    expect(fieldValue(profile, "actual_enrollment")?.missingReason).toBe(
      "not_reported",
    );
    expect(fieldValue(profile, "enrollment_type")?.value).toBe("ESTIMATED");
    expect(fieldValue(profile, "study_start_date")?.value).toBe(
      "2024-06-14 (ACTUAL)",
    );
    expect(fieldValue(profile, "primary_completion_date")?.value).toBe(
      "2026-08 (ESTIMATED)",
    );
    expect(fieldValue(profile, "number_of_sites")?.value).toBe(3);
    expect(fieldValue(profile, "countries")?.value).toEqual([
      "United States",
      "Japan",
    ]);
    expect(fieldValue(profile, "randomization")?.value).toBe("Randomized");
    expect(fieldValue(profile, "comparator_type")?.value).toBeNull();
    expect(fieldValue(profile, "comparator_type")?.missingReason).toBe(
      "not_reported",
    );
    expect(fieldValue(profile, "alpha")?.value).toBeNull();
    expect(fieldValue(profile, "alpha")?.missingReason).toBe("requires_ai");
    expect(fieldValue(profile, "alpha")?.extractionMethod).toBe("ai");
    expect(fieldValue(profile, "arm_level_results")?.value).toBeNull();
    expect(fieldValue(profile, "key_inclusion_criteria")?.extractionMethod).toBe(
      "api",
    );
    expect(profile.resultsAvailable).toBe(false);
  });

  it("keeps planned and actual enrollment mutually exclusive from API type", () => {
    const actualStudy = structuredClone(fixtureStudy);
    actualStudy.protocolSection.designModule.enrollmentInfo = {
      count: 180,
      type: "ACTUAL",
    };
    const profile = extractClinicalDesignProfile(actualStudy);
    expect(fieldValue(profile, "planned_sample_size")?.value).toBeNull();
    expect(fieldValue(profile, "actual_enrollment")?.value).toBe(180);
  });

  it("reads explicit comparator arm types only", () => {
    const withPlacebo = structuredClone(fixtureStudy);
    withPlacebo.protocolSection.armsInterventionsModule.armGroups[1] = {
      label: "Placebo",
      type: "PLACEBO_COMPARATOR",
      interventionNames: ["Placebo tablet"],
    };
    const profile = extractClinicalDesignProfile(withPlacebo);
    expect(fieldValue(profile, "comparator_type")?.value).toEqual([
      "PLACEBO_COMPARATOR",
    ]);
    expect(fieldValue(profile, "comparator_treatment")?.value).toEqual([
      "Placebo tablet",
    ]);
  });
});

describe("human review integrity", () => {
  it("keeps API original and reviewed value separate", () => {
    const extracted = extractClinicalDesignProfile(fixtureStudy);
    const initial = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extracted],
    });
    const edited = applyDesignFieldReview(
      initial,
      "NCT06389136",
      "planned_sample_size",
      {
        action: "edit",
        value: 250,
        reviewer: "Reviewer",
      },
    );
    const field = edited.profiles[0].fields.find(
      (item) => item.key === "planned_sample_size",
    );
    expect(field?.value).toBe(200);
    expect(field?.reviewedValue).toBe(250);
    expect(field?.reviewStatus).toBe("edited");
  });

  it("keeps approval when the API value is unchanged", () => {
    const first = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
    });
    const reviewed = applyDesignFieldReview(
      first,
      "NCT06389136",
      "planned_sample_size",
      { action: "approve", reviewer: "Reviewer" },
    );
    const second = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
      previous: reviewed,
    });
    const field = second.profiles[0].fields.find(
      (item) => item.key === "planned_sample_size",
    );
    expect(field?.value).toBe(200);
    expect(field?.reviewedValue).toBe(200);
    expect(field?.reviewStatus).toBe("approved");
    expect(field?.valueChangeKind).toBe("none");
    expect(isConfirmedDesignField(field!)).toBe(true);
  });

  it("keeps approval on formal API changes", () => {
    const first = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
    });
    const reviewed = applyDesignFieldReview(
      first,
      "NCT06389136",
      "primary_endpoint",
      { action: "approve", reviewer: "Reviewer" },
    );
    const formal = structuredClone(fixtureStudy);
    formal.protocolSection.outcomesModule.primaryOutcomes[0].measure =
      "Participants who achieve EASI-90";
    const second = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(formal)],
      previous: reviewed,
    });
    const field = second.profiles[0].fields.find(
      (item) => item.key === "primary_endpoint",
    );
    expect(field?.reviewStatus).toBe("approved");
    expect(field?.valueChangeKind).toBe("formal");
    expect(isConfirmedDesignField(field!)).toBe(true);
  });

  it("marks substantive API changes as re-review required", () => {
    const first = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
    });
    const reviewed = applyDesignFieldReview(
      first,
      "NCT06389136",
      "planned_sample_size",
      { action: "approve", reviewer: "Reviewer" },
    );
    const changed = structuredClone(fixtureStudy);
    changed.protocolSection.designModule.enrollmentInfo = {
      count: 240,
      type: "ESTIMATED",
    };
    const second = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(changed)],
      previous: reviewed,
    });
    const field = second.profiles[0].fields.find(
      (item) => item.key === "planned_sample_size",
    );
    expect(field?.value).toBe(240);
    expect(field?.previousApiValue).toBe(200);
    expect(field?.reviewedValue).toBe(200);
    expect(field?.reviewStatus).toBe("re_review_required");
    expect(field?.valueChangeKind).toBe("substantive");
    expect(isConfirmedDesignField(field!)).toBe(false);
    expect(confirmedDesignValue(field!)).toBeNull();
    expect(second.jobStatus).toBe("review_required");
  });

  it("restores approval if a later collection reverts the API value", () => {
    const first = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
    });
    const reviewed = applyDesignFieldReview(
      first,
      "NCT06389136",
      "planned_sample_size",
      { action: "approve", reviewer: "Reviewer" },
    );
    const changed = structuredClone(fixtureStudy);
    changed.protocolSection.designModule.enrollmentInfo = {
      count: 240,
      type: "ESTIMATED",
    };
    const pending = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(changed)],
      previous: reviewed,
    });
    const reverted = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
      previous: pending,
    });
    const field = reverted.profiles[0].fields.find(
      (item) => item.key === "planned_sample_size",
    );
    expect(field?.reviewStatus).toBe("approved");
    expect(field?.value).toBe(200);
    expect(isConfirmedDesignField(field!)).toBe(true);
  });

  it("keeps reject and edit decisions after re-collection", () => {
    const first = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
    });
    const rejected = applyDesignFieldReview(
      first,
      "NCT06389136",
      "sponsor",
      { action: "reject", reviewer: "Reviewer" },
    );
    const edited = applyDesignFieldReview(
      rejected,
      "NCT06389136",
      "planned_sample_size",
      { action: "edit", value: 250, reviewer: "Reviewer" },
    );
    const again = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [extractClinicalDesignProfile(fixtureStudy)],
      previous: edited,
    });
    expect(
      again.profiles[0].fields.find((item) => item.key === "sponsor")
        ?.reviewStatus,
    ).toBe("rejected");
    const sample = again.profiles[0].fields.find(
      (item) => item.key === "planned_sample_size",
    );
    expect(sample?.reviewStatus).toBe("edited");
    expect(sample?.value).toBe(200);
    expect(sample?.reviewedValue).toBe(250);
  });
});

describe("buildClinicalDesignComparison", () => {
  it("marks differences and leaves AI columns unexecuted", () => {
    const second = structuredClone(fixtureStudy);
    second.protocolSection.identificationModule.nctId = "NCT00000001";
    second.protocolSection.designModule.enrollmentInfo = {
      count: 80,
      type: "ESTIMATED",
    };
    const comparison = buildClinicalDesignComparison({
      assessmentId: "ASSESS-TEST",
      profiles: [
        extractClinicalDesignProfile(fixtureStudy),
        extractClinicalDesignProfile(second),
      ],
    });
    const sampleSize = comparison.rows.find(
      (row) => row.fieldKey === "planned_sample_size",
    );
    expect(sampleSize?.differenceKind).toBe("different");
    expect(sampleSize?.programmaticNote).toContain("NCT06389136=200");
    expect(comparison.aiStatus).toBe("not_executed");
    expect(sampleSize?.aiComparison).toBeUndefined();
    expect(comparison.jobStatus).toBe("completed");
  });
});
