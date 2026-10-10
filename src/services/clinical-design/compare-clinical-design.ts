import type {
  ClinicalDesignComparison,
  ClinicalDesignComparisonRow,
  ClinicalDesignFieldKey,
  ClinicalDesignProfile,
  DesignFieldReviewStatus,
  DesignFieldValue,
  SourcedDesignField,
} from "@/domain/models";
import { createIdleTrialDesignComparison } from "@/services/ai/trial-design-comparator";
import { classifyValueChange } from "./confirmed-evidence";
import { clinicalDesignFields } from "./fields";
import { effectiveDesignValue, formatDesignValue } from "./extract-clinical-design";

export function buildClinicalDesignComparison(input: {
  assessmentId: string;
  profiles: ClinicalDesignProfile[];
  previous?: ClinicalDesignComparison | null;
}): ClinicalDesignComparison {
  const now = new Date().toISOString();
  const profiles = input.profiles.map((profile) =>
    mergeProfileReviews(profile, input.previous),
  );
  const nctIds = profiles.map((profile) => profile.nctId);
  const ai = createIdleTrialDesignComparison(
    "Phase 1는 ClinicalTrials.gov API 추출과 프로그램 비교만 수행합니다. AI 시사점은 실제 AI Provider가 연결된 이후 Phase에서 생성합니다.",
  );

  const rows = clinicalDesignFields.map((definition) => {
    const valuesByNct: Record<string, SourcedDesignField> = {};
    for (const profile of profiles) {
      const field = profile.fields.find((item) => item.key === definition.key);
      valuesByNct[profile.nctId] =
        field ??
        emptyField(definition.key, profile.nctId, profile.extractionStatus);
    }

    const reported = nctIds
      .map((nctId) => effectiveDesignValue(valuesByNct[nctId]))
      .filter((value) => !isEmpty(value));
    const missingCount = nctIds.length - reported.length;
    const uniqueValues = uniqueNormalized(reported);
    const differenceKind =
      nctIds.length === 0 || reported.length === 0
        ? "all_missing"
        : uniqueValues.length === 1 && missingCount === 0
          ? "same"
          : uniqueValues.length === 1 && missingCount > 0
            ? "partially_missing"
            : "different";

    return {
      domain: definition.domain,
      fieldKey: definition.key,
      label: definition.label,
      valuesByNct,
      differenceKind,
      programmaticNote: buildProgrammaticNote(
        definition.label,
        nctIds,
        valuesByNct,
        differenceKind,
      ),
      evidenceSources: nctIds
        .map((nctId) => {
          const field = valuesByNct[nctId];
          return field.source
            ? `${field.source.nctId} · ${field.source.apiField}`
            : nctId;
        }),
      reviewStatus: aggregateReview(
        nctIds.map((nctId) => valuesByNct[nctId].reviewStatus),
      ),
    } satisfies ClinicalDesignComparisonRow;
  });

  const failed = profiles.some(
    (profile) => profile.extractionStatus === "failed",
  );
  const needsReview = profiles.some((profile) =>
    profile.fields.some(
      (field) =>
        field.reviewStatus === "re_review_required" ||
        (field.extractionMethod === "ai" &&
          field.value !== null &&
          field.reviewStatus === "not_reviewed"),
    ),
  );

  return {
    assessmentId: input.assessmentId,
    nctIds,
    profiles,
    rows,
    jobStatus: failed
      ? "failed"
      : needsReview
        ? "review_required"
        : "completed",
    aiStatus: ai.status,
    aiProvider: ai.provider,
    aiModel: ai.model,
    aiPromptVersion: ai.promptVersion,
    extractedAt: now,
    updatedAt: now,
  };
}

export function applyDesignFieldReview(
  record: ClinicalDesignComparison,
  nctId: string,
  fieldKey: ClinicalDesignFieldKey,
  review: {
    action: "approve" | "edit" | "reject";
    value?: DesignFieldValue;
    note?: string;
    reviewer: string;
  },
): ClinicalDesignComparison {
  const profiles = record.profiles.map((profile) => {
    if (profile.nctId !== nctId) return profile;
    return {
      ...profile,
      fields: profile.fields.map((field) => {
        if (field.key !== fieldKey) return field;
        if (review.action === "approve") {
          return {
            ...field,
            reviewStatus: "approved" as const,
            reviewedValue: field.value,
            reviewNote: review.note,
            reviewedBy: review.reviewer,
            reviewedAt: new Date().toISOString(),
            sourceChangedAfterReview: false,
            previousApiValue: undefined,
            valueChangeKind: "none" as const,
            reviewStatusBeforeSourceChange: undefined,
          };
        }
        if (review.action === "reject") {
          return {
            ...field,
            reviewStatus: "rejected" as const,
            reviewedValue: null,
            reviewNote: review.note,
            reviewedBy: review.reviewer,
            reviewedAt: new Date().toISOString(),
            sourceChangedAfterReview: false,
            previousApiValue: undefined,
            valueChangeKind: "none" as const,
            reviewStatusBeforeSourceChange: undefined,
          };
        }
        return {
          ...field,
          reviewStatus: "edited" as const,
          reviewedValue: review.value ?? field.value,
          reviewNote: review.note,
          reviewedBy: review.reviewer,
          reviewedAt: new Date().toISOString(),
          sourceChangedAfterReview: false,
          previousApiValue: undefined,
          valueChangeKind: "none" as const,
          reviewStatusBeforeSourceChange: undefined,
        };
      }),
    };
  });

  return buildClinicalDesignComparison({
    assessmentId: record.assessmentId,
    profiles,
    previous: { ...record, profiles },
  });
}

function mergeProfileReviews(
  profile: ClinicalDesignProfile,
  previous?: ClinicalDesignComparison | null,
): ClinicalDesignProfile {
  const previousProfile = previous?.profiles.find(
    (item) => item.nctId === profile.nctId,
  );
  if (!previousProfile) return profile;
  return {
    ...profile,
    fields: profile.fields.map((field) => {
      const prior = previousProfile.fields.find((item) => item.key === field.key);
      if (!prior || prior.reviewStatus === "not_reviewed") return field;
      return mergeReviewedField(field, prior);
    }),
  };
}

function mergeReviewedField(
  field: SourcedDesignField,
  prior: SourcedDesignField,
): SourcedDesignField {
  const previousStatus =
    prior.reviewStatus === "re_review_required"
      ? (prior.reviewStatusBeforeSourceChange ?? "approved")
      : prior.reviewStatus === "approved" ||
          prior.reviewStatus === "edited" ||
          prior.reviewStatus === "rejected"
        ? prior.reviewStatus
        : undefined;
  const baselineValue = prior.previousApiValue ?? prior.value;
  const changeKind = classifyValueChange(baselineValue, field.value);

  if (prior.reviewStatus === "rejected") {
    return {
      ...field,
      reviewStatus: "rejected",
      reviewedValue: null,
      reviewNote: prior.reviewNote,
      reviewedBy: prior.reviewedBy,
      reviewedAt: prior.reviewedAt,
      sourceChangedAfterReview: changeKind !== "none",
      previousApiValue: changeKind === "none" ? undefined : baselineValue,
      valueChangeKind: changeKind,
      reviewStatusBeforeSourceChange: "rejected",
    };
  }

  if (changeKind === "none" || changeKind === "formal") {
    return {
      ...field,
      reviewStatus: previousStatus ?? prior.reviewStatus,
      reviewedValue: prior.reviewedValue,
      reviewNote: prior.reviewNote,
      reviewedBy: prior.reviewedBy,
      reviewedAt: prior.reviewedAt,
      sourceChangedAfterReview: changeKind === "formal",
      previousApiValue: changeKind === "formal" ? baselineValue : undefined,
      valueChangeKind: changeKind,
      reviewStatusBeforeSourceChange: undefined,
    };
  }

  return {
    ...field,
    reviewStatus: "re_review_required",
    reviewedValue: prior.reviewedValue,
    reviewNote: prior.reviewNote,
    reviewedBy: prior.reviewedBy,
    reviewedAt: prior.reviewedAt,
    sourceChangedAfterReview: true,
    previousApiValue: baselineValue,
    valueChangeKind: "substantive",
    reviewStatusBeforeSourceChange: previousStatus,
  };
}

function emptyField(
  key: ClinicalDesignFieldKey,
  nctId: string,
  status: ClinicalDesignProfile["extractionStatus"],
): SourcedDesignField {
  return {
    key,
    value: null,
    source: {
      nctId,
      apiField: "unavailable",
      url: `https://clinicaltrials.gov/study/${nctId}`,
    },
    extractionMethod: "api",
    reviewStatus: "not_reviewed",
    missingReason: status === "failed" ? "not_reported" : "not_reported",
  };
}

function buildProgrammaticNote(
  label: string,
  nctIds: string[],
  valuesByNct: Record<string, SourcedDesignField>,
  differenceKind: ClinicalDesignComparisonRow["differenceKind"],
) {
  if (differenceKind === "all_missing") {
    return `${label}: 선택한 임상시험에서 확인되지 않음.`;
  }
  if (differenceKind === "same") {
    return `${label}: 선택한 임상시험에서 동일한 값이 확인됨.`;
  }
  const parts = nctIds.map((nctId) => {
    const field = valuesByNct[nctId];
    return `${nctId}=${formatDesignValue(effectiveDesignValue(field))}`;
  });
  if (differenceKind === "partially_missing") {
    return `${label}: 일부 임상시험에서만 확인됨 (${parts.join("; ")}).`;
  }
  return `${label}: 임상시험 간 값이 다름 (${parts.join("; ")}).`;
}

function aggregateReview(
  statuses: DesignFieldReviewStatus[],
): DesignFieldReviewStatus | "mixed" {
  if (statuses.every((status) => status === "not_reviewed")) {
    return "not_reviewed";
  }
  if (statuses.every((status) => status === statuses[0])) {
    return statuses[0];
  }
  return "mixed";
}

function uniqueNormalized(values: DesignFieldValue[]) {
  return Array.from(new Set(values.map((value) => normalizeValue(value))));
}

function normalizeValue(value: DesignFieldValue) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
  }
  return String(value).trim().toLowerCase();
}

function isEmpty(value: DesignFieldValue) {
  if (value === null || value === undefined || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}
