import { z } from "zod";

import type {
  ClinicalTrial,
  OutcomeMeasure,
  StudyDesign,
  TrialLocation,
} from "@/domain/models";
import { ConnectorError } from "@/services/connectors/connector-error";

const dateStructSchema = z
  .object({
    date: z.string().optional(),
  })
  .optional();

const outcomeSchema = z.object({
  measure: z.string().optional(),
  description: z.string().optional(),
  timeFrame: z.string().optional(),
});

const studySchema = z.object({
  protocolSection: z.object({
    identificationModule: z.object({
      nctId: z.string(),
      briefTitle: z.string().optional(),
      officialTitle: z.string().optional(),
    }),
    statusModule: z
      .object({
        overallStatus: z.string().optional(),
        startDateStruct: dateStructSchema,
        primaryCompletionDateStruct: dateStructSchema,
        completionDateStruct: dateStructSchema,
        studyFirstPostDateStruct: dateStructSchema,
        lastUpdatePostDateStruct: dateStructSchema,
      })
      .optional(),
    sponsorCollaboratorsModule: z
      .object({
        leadSponsor: z
          .object({
            name: z.string().optional(),
          })
          .optional(),
        collaborators: z
          .array(
            z.object({
              name: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    designModule: z
      .object({
        studyType: z.string().optional(),
        phases: z.array(z.string()).optional(),
        enrollmentInfo: z
          .object({
            count: z.number().optional(),
            type: z.string().optional(),
          })
          .optional(),
        designInfo: z
          .object({
            allocation: z.string().optional(),
            interventionModel: z.string().optional(),
            maskingInfo: z
              .object({
                masking: z.string().optional(),
              })
              .optional(),
            primaryPurpose: z.string().optional(),
            observationalModel: z.string().optional(),
            timePerspective: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    conditionsModule: z
      .object({
        conditions: z.array(z.string()).optional(),
      })
      .optional(),
    armsInterventionsModule: z
      .object({
        interventions: z
          .array(
            z.object({
              name: z.string().optional(),
              type: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    outcomesModule: z
      .object({
        primaryOutcomes: z.array(outcomeSchema).optional(),
        secondaryOutcomes: z.array(outcomeSchema).optional(),
      })
      .optional(),
    eligibilityModule: z
      .object({
        eligibilityCriteria: z.string().optional(),
        sex: z.string().optional(),
        minimumAge: z.string().optional(),
        maximumAge: z.string().optional(),
      })
      .optional(),
    contactsLocationsModule: z
      .object({
        locations: z
          .array(
            z.object({
              facility: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              zip: z.string().optional(),
              country: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});

function mapOutcome(
  outcome: z.infer<typeof outcomeSchema>,
): OutcomeMeasure | null {
  if (!outcome.measure) {
    return null;
  }

  return {
    measure: outcome.measure,
    description: outcome.description,
    timeFrame: outcome.timeFrame,
  };
}

export function mapClinicalTrial(rawStudy: unknown): ClinicalTrial {
  const parsed = studySchema.safeParse(rawStudy);

  if (!parsed.success) {
    throw new ConnectorError(
      "invalid_response",
      "ClinicalTrials.gov returned an unexpected study format.",
      502,
      undefined,
      { cause: parsed.error },
    );
  }

  const protocol = parsed.data.protocolSection;
  const identification = protocol.identificationModule;
  const status = protocol.statusModule;
  const sponsor = protocol.sponsorCollaboratorsModule;
  const design = protocol.designModule;
  const eligibility = protocol.eligibilityModule;
  const rawLocations = protocol.contactsLocationsModule?.locations ?? [];

  const locations: TrialLocation[] = rawLocations.map((location) => ({
    facility: location.facility,
    city: location.city,
    state: location.state,
    postalCode: location.zip,
    country: location.country,
  }));

  const countries = Array.from(
    new Set(
      locations
        .map((location) => location.country)
        .filter((country): country is string => Boolean(country)),
    ),
  ).sort();

  const studyDesign: StudyDesign = {
    allocation: design?.designInfo?.allocation,
    interventionModel: design?.designInfo?.interventionModel,
    masking: design?.designInfo?.maskingInfo?.masking,
    primaryPurpose: design?.designInfo?.primaryPurpose,
    observationalModel: design?.designInfo?.observationalModel,
    timePerspective: design?.designInfo?.timePerspective,
  };

  const primaryOutcomes = (protocol.outcomesModule?.primaryOutcomes ?? [])
    .map(mapOutcome)
    .filter((outcome): outcome is OutcomeMeasure => outcome !== null);
  const secondaryOutcomes = (protocol.outcomesModule?.secondaryOutcomes ?? [])
    .map(mapOutcome)
    .filter((outcome): outcome is OutcomeMeasure => outcome !== null);

  return {
    nctId: identification.nctId,
    officialTitle: identification.officialTitle,
    briefTitle:
      identification.briefTitle ??
      identification.officialTitle ??
      identification.nctId,
    sponsor: sponsor?.leadSponsor?.name,
    collaborators: (sponsor?.collaborators ?? [])
      .map((collaborator) => collaborator.name)
      .filter((name): name is string => Boolean(name)),
    studyType: design?.studyType,
    phases: design?.phases ?? [],
    conditions: protocol.conditionsModule?.conditions ?? [],
    interventions: (protocol.armsInterventionsModule?.interventions ?? [])
      .map((intervention) => intervention.name)
      .filter((name): name is string => Boolean(name)),
    enrollment: design?.enrollmentInfo?.count,
    design: studyDesign,
    primaryOutcomes,
    secondaryOutcomes,
    eligibilityCriteria: eligibility?.eligibilityCriteria,
    sex: eligibility?.sex,
    minimumAge: eligibility?.minimumAge,
    maximumAge: eligibility?.maximumAge,
    locations,
    countries,
    overallStatus: status?.overallStatus,
    startDate: status?.startDateStruct?.date,
    primaryCompletionDate: status?.primaryCompletionDateStruct?.date,
    studyCompletionDate: status?.completionDateStruct?.date,
    lastUpdate: status?.lastUpdatePostDateStruct?.date,
    source: {
      id: `ctgov:${identification.nctId}`,
      type: "clinicaltrials_gov",
      externalId: identification.nctId,
      label: identification.nctId,
      url: `https://clinicaltrials.gov/study/${identification.nctId}`,
      accessedAt: new Date().toISOString(),
    },
  };
}
