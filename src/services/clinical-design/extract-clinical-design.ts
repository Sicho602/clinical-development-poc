import { z } from "zod";

import type {
  ClinicalDesignArm,
  ClinicalDesignEndpoint,
  ClinicalDesignFieldKey,
  ClinicalDesignProfile,
  ClinicalDesignResultRow,
  DesignExtractionMethod,
  DesignFieldValue,
  DesignMissingReason,
  SourcedDesignField,
} from "@/domain/models";
import { ConnectorError } from "@/services/connectors/connector-error";
import { parseEligibilityCriteria } from "./parse-eligibility";

const dateStructSchema = z
  .object({
    date: z.string().optional(),
    type: z.string().optional(),
  })
  .optional();

const outcomeSchema = z.object({
  measure: z.string().optional(),
  description: z.string().optional(),
  timeFrame: z.string().optional(),
});

const armSchema = z.object({
  label: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  interventionNames: z.array(z.string()).optional(),
});

const interventionSchema = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  armGroupLabels: z.array(z.string()).optional(),
  otherNames: z.array(z.string()).optional(),
});

const locationSchema = z.object({
  facility: z.string().optional(),
  country: z.string().optional(),
  status: z.string().optional(),
});

const resultMeasurementSchema = z.object({
  groupId: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  spread: z.union([z.string(), z.number()]).optional(),
});

const resultOutcomeSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  timeFrame: z.string().optional(),
  paramType: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  groups: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
      }),
    )
    .optional(),
  classes: z
    .array(
      z.object({
        title: z.string().optional(),
        categories: z
          .array(
            z.object({
              title: z.string().optional(),
              measurements: z.array(resultMeasurementSchema).optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const rawStudySchema = z.object({
  hasResults: z.boolean().optional(),
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
      })
      .optional(),
    sponsorCollaboratorsModule: z
      .object({
        leadSponsor: z.object({ name: z.string().optional() }).optional(),
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
            interventionModelDescription: z.string().optional(),
            maskingInfo: z
              .object({
                masking: z.string().optional(),
                whoMasked: z.array(z.string()).optional(),
                maskingDescription: z.string().optional(),
              })
              .optional(),
            primaryPurpose: z.string().optional(),
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
        armGroups: z.array(armSchema).optional(),
        interventions: z.array(interventionSchema).optional(),
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
        locations: z.array(locationSchema).optional(),
      })
      .optional(),
  }),
  resultsSection: z
    .object({
      outcomeMeasuresModule: z
        .object({
          outcomeMeasures: z.array(resultOutcomeSchema).optional(),
        })
        .optional(),
      adverseEventsModule: z
        .object({
          frequencyThreshold: z.number().optional(),
          eventGroups: z
            .array(
              z.object({
                title: z.string().optional(),
                seriousNumAffected: z.number().optional(),
                seriousNumAtRisk: z.number().optional(),
                otherNumAffected: z.number().optional(),
                otherNumAtRisk: z.number().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const AI_ONLY_FIELDS: ClinicalDesignFieldKey[] = [
  "disease_severity",
  "prior_treatment_requirements",
  "treatment_line",
  "washout_requirements",
  "background_therapy",
  "rescue_medication",
  "dosing_frequency",
  "treatment_duration",
  "follow_up_duration",
  "endpoint_type",
  "statistical_hypothesis",
  "alpha",
  "power",
  "effect_size_assumption",
  "analysis_population",
];

export function extractClinicalDesignProfile(
  rawStudy: unknown,
): ClinicalDesignProfile {
  const parsed = rawStudySchema.safeParse(rawStudy);
  if (!parsed.success) {
    throw new ConnectorError(
      "invalid_response",
      "ClinicalTrials.gov 상세 응답을 임상 디자인으로 해석하지 못했습니다.",
      502,
      undefined,
      { cause: parsed.error },
    );
  }

  const protocol = parsed.data.protocolSection;
  const nctId = protocol.identificationModule.nctId;
  const url = `https://clinicaltrials.gov/study/${nctId}`;
  const now = new Date().toISOString();
  const fields: SourcedDesignField[] = [];

  const add = (
    key: ClinicalDesignFieldKey,
    value: DesignFieldValue,
    apiField: string,
    options?: {
      sourceText?: string;
      method?: DesignExtractionMethod;
      missingReason?: DesignMissingReason;
    },
  ) => {
    fields.push(createField(key, value, nctId, apiField, url, options));
  };

  const title =
    protocol.identificationModule.officialTitle ??
    protocol.identificationModule.briefTitle ??
    nctId;
  add("nct_id", nctId, "protocolSection.identificationModule.nctId");
  add(
    "study_title",
    title,
    "protocolSection.identificationModule.officialTitle",
    {
      sourceText:
        protocol.identificationModule.officialTitle ??
        protocol.identificationModule.briefTitle,
    },
  );
  add(
    "sponsor",
    protocol.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    "protocolSection.sponsorCollaboratorsModule.leadSponsor.name",
  );
  add(
    "phase",
    joinList(protocol.designModule?.phases),
    "protocolSection.designModule.phases",
  );
  add(
    "study_status",
    protocol.statusModule?.overallStatus ?? null,
    "protocolSection.statusModule.overallStatus",
  );
  add(
    "study_type",
    protocol.designModule?.studyType ?? null,
    "protocolSection.designModule.studyType",
  );
  add(
    "study_start_date",
    formatDate(protocol.statusModule?.startDateStruct),
    "protocolSection.statusModule.startDateStruct",
  );
  add(
    "primary_completion_date",
    formatDate(protocol.statusModule?.primaryCompletionDateStruct),
    "protocolSection.statusModule.primaryCompletionDateStruct",
  );
  add(
    "study_completion_date",
    formatDate(protocol.statusModule?.completionDateStruct),
    "protocolSection.statusModule.completionDateStruct",
  );

  const locations = protocol.contactsLocationsModule?.locations ?? [];
  const countries = unique(
    locations
      .map((location) => location.country)
      .filter((country): country is string => Boolean(country)),
  );
  add(
    "countries",
    countries.length ? countries : null,
    "protocolSection.contactsLocationsModule.locations.country",
  );
  add(
    "number_of_sites",
    locations.length || null,
    "protocolSection.contactsLocationsModule.locations",
  );

  const enrollment = protocol.designModule?.enrollmentInfo;
  const enrollmentType = enrollment?.type ?? null;
  const enrollmentCount = enrollment?.count ?? null;
  add(
    "enrollment_type",
    enrollmentType,
    "protocolSection.designModule.enrollmentInfo.type",
  );
  add(
    "planned_sample_size",
    enrollmentType === "ESTIMATED" ? enrollmentCount : null,
    "protocolSection.designModule.enrollmentInfo",
    {
      missingReason:
        enrollmentType === "ACTUAL" && enrollmentCount !== null
          ? "not_reported"
          : enrollmentCount === null
            ? "not_reported"
            : undefined,
    },
  );
  add(
    "actual_enrollment",
    enrollmentType === "ACTUAL" ? enrollmentCount : null,
    "protocolSection.designModule.enrollmentInfo",
    {
      missingReason:
        enrollmentType === "ESTIMATED" && enrollmentCount !== null
          ? "not_reported"
          : enrollmentCount === null
            ? "not_reported"
            : undefined,
    },
  );

  const allocation = protocol.designModule?.designInfo?.allocation ?? null;
  add(
    "randomization",
    formatRandomization(allocation),
    "protocolSection.designModule.designInfo.allocation",
  );
  const modelDescription =
    protocol.designModule?.designInfo?.interventionModelDescription;
  const allocationRatio = extractAllocationRatio(modelDescription);
  add(
    "allocation_ratio",
    allocationRatio,
    "protocolSection.designModule.designInfo.interventionModelDescription",
    {
      sourceText: allocationRatio ? modelDescription : undefined,
      missingReason: allocationRatio ? undefined : "not_in_api",
    },
  );

  const maskingInfo = protocol.designModule?.designInfo?.maskingInfo;
  add(
    "masking",
    formatMasking(maskingInfo),
    "protocolSection.designModule.designInfo.maskingInfo",
  );
  add(
    "intervention_model",
    protocol.designModule?.designInfo?.interventionModel ?? null,
    "protocolSection.designModule.designInfo.interventionModel",
  );

  const arms = (protocol.armsInterventionsModule?.armGroups ?? []).map(
    (arm): ClinicalDesignArm => ({
      label: arm.label,
      type: arm.type,
      description: arm.description,
      interventions: arm.interventionNames ?? [],
    }),
  );
  add(
    "number_of_arms",
    arms.length || null,
    "protocolSection.armsInterventionsModule.armGroups",
  );

  const conditions = protocol.conditionsModule?.conditions ?? [];
  add(
    "indication",
    conditions.length ? conditions : null,
    "protocolSection.conditionsModule.conditions",
  );

  const eligibility = protocol.eligibilityModule;
  add(
    "age",
    formatAge(eligibility?.minimumAge, eligibility?.maximumAge),
    "protocolSection.eligibilityModule.minimumAge",
  );
  add("sex", eligibility?.sex ?? null, "protocolSection.eligibilityModule.sex");

  const parsedEligibility = parseEligibilityCriteria(
    eligibility?.eligibilityCriteria,
  );
  add(
    "key_inclusion_criteria",
    parsedEligibility.inclusion.length ? parsedEligibility.inclusion : null,
    "protocolSection.eligibilityModule.eligibilityCriteria",
    {
      sourceText: eligibility?.eligibilityCriteria,
      method: "api",
    },
  );
  add(
    "key_exclusion_criteria",
    parsedEligibility.exclusion.length ? parsedEligibility.exclusion : null,
    "protocolSection.eligibilityModule.eligibilityCriteria",
    {
      sourceText: eligibility?.eligibilityCriteria,
      method: "api",
    },
  );

  const interventions = protocol.armsInterventionsModule?.interventions ?? [];
  const comparatorArms = arms.filter((arm) => isComparatorArm(arm.type));
  const experimentalArms = arms.filter((arm) => !isComparatorArm(arm.type));
  const experimentalTreatments = unique(
    experimentalArms.flatMap((arm) => arm.interventions).filter(Boolean),
  );
  const allTreatments = unique(
    interventions
      .map((item) => item.name)
      .filter((name): name is string => Boolean(name)),
  );
  add(
    "investigational_treatment",
    experimentalTreatments.length
      ? experimentalTreatments
      : allTreatments.length
        ? allTreatments
        : null,
    "protocolSection.armsInterventionsModule.armGroups",
  );
  add(
    "dose",
    allTreatments.length ? allTreatments : null,
    "protocolSection.armsInterventionsModule.interventions.name",
  );
  const routes = unique(
    interventions
      .map((item) => item.description)
      .filter((description): description is string => Boolean(description)),
  );
  add(
    "route",
    routes.length ? routes : null,
    "protocolSection.armsInterventionsModule.interventions.description",
  );
  add(
    "comparator_type",
    unique(
      comparatorArms
        .map((arm) => arm.type)
        .filter((type): type is string => Boolean(type)),
    ) || null,
    "protocolSection.armsInterventionsModule.armGroups.type",
    {
      missingReason: comparatorArms.length ? undefined : "not_reported",
    },
  );
  add(
    "comparator_treatment",
    unique(comparatorArms.flatMap((arm) => arm.interventions)).length
      ? unique(comparatorArms.flatMap((arm) => arm.interventions))
      : null,
    "protocolSection.armsInterventionsModule.armGroups",
    {
      missingReason: comparatorArms.length ? undefined : "not_reported",
    },
  );

  const primaryOutcomes = protocol.outcomesModule?.primaryOutcomes ?? [];
  const secondaryOutcomes = protocol.outcomesModule?.secondaryOutcomes ?? [];
  const endpoints: ClinicalDesignEndpoint[] = [
    ...primaryOutcomes
      .filter((outcome) => outcome.measure)
      .map((outcome) => ({
        kind: "primary" as const,
        measure: outcome.measure as string,
        definition: outcome.description,
        timeFrame: outcome.timeFrame,
      })),
    ...secondaryOutcomes
      .filter((outcome) => outcome.measure)
      .map((outcome) => ({
        kind: "secondary" as const,
        measure: outcome.measure as string,
        definition: outcome.description,
        timeFrame: outcome.timeFrame,
      })),
  ];
  add(
    "primary_endpoint",
    endpoints
      .filter((endpoint) => endpoint.kind === "primary")
      .map((endpoint) => endpoint.measure) || null,
    "protocolSection.outcomesModule.primaryOutcomes.measure",
  );
  add(
    "secondary_endpoints",
    endpoints
      .filter((endpoint) => endpoint.kind === "secondary")
      .map((endpoint) => endpoint.measure) || null,
    "protocolSection.outcomesModule.secondaryOutcomes.measure",
  );
  add(
    "endpoint_definition",
    endpoints
      .map((endpoint) => endpoint.definition)
      .filter((definition): definition is string => Boolean(definition)) ||
      null,
    "protocolSection.outcomesModule.primaryOutcomes.description",
  );
  add(
    "assessment_timepoint",
    unique(
      endpoints
        .map((endpoint) => endpoint.timeFrame)
        .filter((timeFrame): timeFrame is string => Boolean(timeFrame)),
    ) || null,
    "protocolSection.outcomesModule.primaryOutcomes.timeFrame",
  );

  const resultRows = extractResultRows(parsed.data);
  const adverseEvents = extractAdverseEvents(parsed.data);
  add(
    "arm_level_results",
    resultRows.length
      ? resultRows.map((row) => formatResultRow(row))
      : null,
    "resultsSection.outcomeMeasuresModule.outcomeMeasures",
    {
      missingReason: parsed.data.hasResults ? "not_reported" : "not_in_api",
    },
  );
  add(
    "adverse_events",
    adverseEvents.length ? adverseEvents : null,
    "resultsSection.adverseEventsModule.eventGroups",
    {
      missingReason: parsed.data.hasResults ? "not_reported" : "not_in_api",
    },
  );

  for (const key of AI_ONLY_FIELDS) {
    add(key, null, "not_in_structured_api", {
      method: "ai",
      missingReason: "requires_ai",
    });
  }

  return {
    nctId,
    extractedAt: now,
    fields,
    arms,
    endpoints,
    resultRows,
    resultsAvailable: Boolean(parsed.data.hasResults),
    extractionStatus: "completed",
  };
}

export function createFailedDesignProfile(
  nctId: string,
  message: string,
): ClinicalDesignProfile {
  return {
    nctId,
    extractedAt: new Date().toISOString(),
    fields: [],
    arms: [],
    endpoints: [],
    resultRows: [],
    resultsAvailable: false,
    extractionStatus: "failed",
    errorMessage: message,
  };
}

export function effectiveDesignValue(field: SourcedDesignField): DesignFieldValue {
  if (field.reviewStatus === "rejected") return null;
  if (field.reviewStatus === "re_review_required") return field.value;
  if (
    (field.reviewStatus === "edited" || field.reviewStatus === "approved") &&
    field.reviewedValue !== undefined
  ) {
    return field.reviewedValue;
  }
  return field.value;
}

export function formatDesignValue(value: DesignFieldValue) {
  if (value === null || value === undefined || value === "") {
    return "확인되지 않음";
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(" · ") : "확인되지 않음";
  }
  return String(value);
}

function createField(
  key: ClinicalDesignFieldKey,
  value: DesignFieldValue,
  nctId: string,
  apiField: string,
  url: string,
  options?: {
    sourceText?: string;
    method?: DesignExtractionMethod;
    missingReason?: DesignMissingReason;
  },
): SourcedDesignField {
  const empty = isEmptyValue(value);
  return {
    key,
    value: empty ? null : value,
    source: {
      nctId,
      apiField,
      url,
    },
    sourceText: options?.sourceText,
    extractionMethod: options?.method ?? "api",
    reviewStatus: "not_reviewed",
    missingReason: empty
      ? (options?.missingReason ?? "not_reported")
      : undefined,
  };
}

function isEmptyValue(value: DesignFieldValue) {
  if (value === null || value === undefined || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

function joinList(values?: string[]) {
  return values?.length ? values : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function formatDate(
  value?: { date?: string; type?: string } | null,
) {
  if (!value?.date) return null;
  return value.type ? `${value.date} (${value.type})` : value.date;
}

function formatRandomization(allocation?: string | null) {
  if (!allocation) return null;
  if (allocation === "RANDOMIZED") return "Randomized";
  if (allocation === "NON_RANDOMIZED") return "Non-randomized";
  return allocation;
}

function formatMasking(
  maskingInfo?: {
    masking?: string;
    whoMasked?: string[];
    maskingDescription?: string;
  },
) {
  if (!maskingInfo?.masking && !maskingInfo?.whoMasked?.length) return null;
  const who = maskingInfo.whoMasked?.length
    ? ` (${maskingInfo.whoMasked.join(", ")})`
    : "";
  return `${maskingInfo.masking ?? ""}${who}`.trim() || null;
}

function formatAge(minimum?: string, maximum?: string) {
  if (!minimum && !maximum) return null;
  if (minimum && maximum) return `${minimum} – ${maximum}`;
  return minimum ?? maximum ?? null;
}

function extractAllocationRatio(description?: string) {
  if (!description) return null;
  const match = description.match(/\b(\d+)\s*:\s*(\d+(?:\s*:\s*\d+)*)\b/);
  return match ? match[0].replace(/\s+/g, "") : null;
}

function isComparatorArm(type?: string) {
  if (!type) return false;
  return (
    type === "PLACEBO_COMPARATOR" ||
    type === "ACTIVE_COMPARATOR" ||
    type === "SHAM_COMPARATOR" ||
    type === "NO_INTERVENTION"
  );
}

function extractResultRows(
  study: z.infer<typeof rawStudySchema>,
): ClinicalDesignResultRow[] {
  const measures =
    study.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const rows: ClinicalDesignResultRow[] = [];
  for (const measure of measures) {
    const groups = new Map(
      (measure.groups ?? []).map((group) => [group.id ?? "", group.title]),
    );
    for (const outcomeClass of measure.classes ?? []) {
      for (const category of outcomeClass.categories ?? []) {
        for (const measurement of category.measurements ?? []) {
          if (
            measurement.value === undefined ||
            measurement.value === null ||
            measurement.value === ""
          ) {
            continue;
          }
          rows.push({
            measure: measure.title ?? "Unnamed outcome",
            timeFrame: measure.timeFrame,
            group: groups.get(measurement.groupId ?? "") ?? measurement.groupId,
            value: String(measurement.value),
            unit: measure.unitOfMeasure,
            spread:
              measurement.spread === undefined
                ? undefined
                : String(measurement.spread),
          });
        }
      }
    }
  }
  return rows;
}

function extractAdverseEvents(study: z.infer<typeof rawStudySchema>) {
  const groups = study.resultsSection?.adverseEventsModule?.eventGroups ?? [];
  return groups
    .map((group) => {
      if (!group.title) return null;
      const serious =
        group.seriousNumAffected !== undefined &&
        group.seriousNumAtRisk !== undefined
          ? `serious ${group.seriousNumAffected}/${group.seriousNumAtRisk}`
          : null;
      const other =
        group.otherNumAffected !== undefined &&
        group.otherNumAtRisk !== undefined
          ? `other ${group.otherNumAffected}/${group.otherNumAtRisk}`
          : null;
      const detail = [serious, other].filter(Boolean).join(", ");
      return detail ? `${group.title}: ${detail}` : group.title;
    })
    .filter((value): value is string => Boolean(value));
}

function formatResultRow(row: ClinicalDesignResultRow) {
  const parts = [
    row.group,
    row.value,
    row.unit,
    row.spread ? `spread ${row.spread}` : null,
    row.timeFrame,
    row.measure,
  ].filter(Boolean);
  return parts.join(" · ");
}
