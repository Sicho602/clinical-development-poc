import type {
  Assessment,
  BenchmarkMetric,
  DevelopmentStrategy,
  DevelopmentStrategyField,
  DevelopmentStrategyFieldKey,
  EvidenceExtraction,
  HistoricalBenchmark,
  StrategySourceType,
  StrategyTraceReference,
} from "@/domain/models";
import type { SavedReferenceTrial } from "@/repositories/browser/reference-trial-repository";
import {
  formatMetricDisplay,
  parseEndpointsFromText,
} from "@/features/benchmark/benchmark-utils";
import { recordHasMojibake } from "@/lib/encoding";
import {
  missingValueCopy,
  strategyBasisCopy,
  strategyFieldLabels as strategyFieldLabelCopy,
  strategySourceLabels as strategySourceLabelCopy,
} from "@/lib/ui-copy";

interface StrategyInputs {
  assessment: Assessment;
  referenceTrials: SavedReferenceTrial[];
  extractions: EvidenceExtraction[];
  benchmark: HistoricalBenchmark | null;
}

export const strategyFieldLabels: Record<
  DevelopmentStrategyFieldKey,
  string
> = { ...strategyFieldLabelCopy };

export const strategySourceLabels: Record<StrategySourceType, string> = {
  ...strategySourceLabelCopy,
};

export function buildDevelopmentStrategy({
  assessment,
  referenceTrials,
  extractions,
  benchmark,
}: StrategyInputs): DevelopmentStrategy {
  const now = new Date().toISOString();
  const endpoint = endpointSuggestion(assessment.id, referenceTrials, benchmark);
  const studyDesign = studyDesignSuggestion(assessment.id, referenceTrials);
  const lineOfTherapy = approvedEvidenceSuggestion(
    assessment.id,
    extractions,
    "line_of_therapy",
  );
  const benchmarkSuggestion = approvedBenchmarkSuggestion(
    assessment.id,
    benchmark,
  );
  const primaryLabel =
    endpoint.primary.reviewedValue ?? endpoint.primary.originalSuggestedValue;

  const fields: DevelopmentStrategyField[] = [
    field(
      "target_phase",
      assessment.candidate.targetClinicalPhase,
      strategyBasisCopy.targetPhase,
      "assessment_input",
      [
        assessmentSource(
          assessment.id,
          `${strategySourceLabels.assessment_input} · ${strategyFieldLabels.target_phase}: ${assessment.candidate.targetClinicalPhase}`,
        ),
      ],
    ),
    field(
      "target_population",
      assessment.candidate.indication,
      strategyBasisCopy.targetPopulation,
      "assessment_input",
      [
        assessmentSource(
          assessment.id,
          `${strategySourceLabels.assessment_input} · ${strategyFieldLabels.target_population}: ${assessment.candidate.indication}`,
        ),
      ],
    ),
    lineOfTherapy,
    studyDesign,
    requiredField("control_comparator", strategyBasisCopy.noComparator),
    endpoint.primary,
    endpoint.secondary,
    requiredField("treatment_duration", strategyBasisCopy.noTreatmentDuration),
    field(
      "target_geography",
      assessment.candidate.targetGeographies.join(", ") || null,
      assessment.candidate.targetGeographies.length
        ? strategyBasisCopy.targetGeography
        : strategyBasisCopy.noTargetGeography,
      assessment.candidate.targetGeographies.length
        ? "assessment_input"
        : "user_input",
      assessment.candidate.targetGeographies.length
        ? [
            assessmentSource(
              assessment.id,
              `${strategySourceLabels.assessment_input} · ${strategyFieldLabels.target_geography}: ${assessment.candidate.targetGeographies.join(", ")}`,
            ),
          ]
        : [],
    ),
    requiredField("target_effect", strategyBasisCopy.targetEffect(primaryLabel)),
    benchmarkSuggestion,
    field(
      "sample_size",
      missingValueCopy.notCalculated,
      strategyBasisCopy.sampleSize,
      "rule",
      [],
    ),
    field(
      "key_assumptions",
      strategyBasisCopy.keyAssumptionsValue,
      strategyBasisCopy.keyAssumptionsBasis,
      "rule",
      [],
    ),
  ];

  return {
    id: `${assessment.id}:development-strategy`,
    assessmentId: assessment.id,
    fields,
    status: "draft",
    isMockEvidenceUsed:
      Boolean(benchmark?.status === "approved" && benchmark.isMock) ||
      extractions.some(
        (item) =>
          item.isMock &&
          item.fields.some((evidence) => evidence.reviewStatus === "approved"),
      ),
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeStrategyReview(
  generated: DevelopmentStrategy,
  saved: DevelopmentStrategy | null,
) {
  if (!saved || recordHasMojibake(saved)) {
    return generated;
  }
  const savedByKey = new Map(saved.fields.map((item) => [item.key, item]));
  return {
    ...generated,
    fields: generated.fields.map((item) => {
      const reviewed = savedByKey.get(item.key);
      if (!reviewed || reviewed.reviewStatus === "draft") return item;
      return {
        ...item,
        reviewedValue: reviewed.reviewedValue,
        reviewStatus: reviewed.reviewStatus,
        modified: reviewed.modified,
        reviewer: reviewed.reviewer,
        reviewedAt: reviewed.reviewedAt,
        sourceType:
          reviewed.modified && reviewed.sourceType === "user_input"
            ? "user_input"
            : item.sourceType,
      };
    }),
    status: saved.status,
    reviewer: saved.reviewer,
    reviewedAt: saved.reviewedAt,
    approvedAt: saved.approvedAt,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
}

function endpointSuggestion(
  assessmentId: string,
  references: SavedReferenceTrial[],
  benchmark: HistoricalBenchmark | null,
) {
  const selected = selectedBenchmarkMetrics(benchmark);
  if (selected.length) {
    const primary =
      selected.find((item) => item.endpointType === "PRIMARY") ?? selected[0];
    const secondary = selected.filter(
      (item) => item.metricId !== primary.metricId,
    );
    return {
      primary: field(
        "primary_endpoint",
        formatMetricDisplay(primary.metricName, primary.timepoint),
        strategyBasisCopy.primaryFromBenchmark,
        "approved_benchmark",
        [
          {
            id: `${benchmark?.id}:${primary.metricId}`,
            type: "approved_benchmark",
            label: formatMetricDisplay(primary.metricName, primary.timepoint),
            href: `/assessments/${assessmentId}/benchmark`,
            isMock: benchmark?.isMock,
          },
        ],
      ),
      secondary: secondary.length
        ? field(
            "secondary_endpoints",
            secondary
              .map((item) =>
                formatMetricDisplay(item.metricName, item.timepoint),
              )
              .join("; "),
            strategyBasisCopy.secondaryFromBenchmark,
            "approved_benchmark",
            secondary.map((item) => ({
              id: `${benchmark?.id}:${item.metricId}`,
              type: "approved_benchmark" as const,
              label: formatMetricDisplay(item.metricName, item.timepoint),
              href: `/assessments/${assessmentId}/benchmark`,
              isMock: benchmark?.isMock,
            })),
          )
        : requiredField(
            "secondary_endpoints",
            strategyBasisCopy.noSecondaryFromBenchmark,
          ),
    };
  }

  const counts = new Map<
    string,
    { count: number; references: SavedReferenceTrial[]; label: string }
  >();
  for (const reference of references) {
    const labels = new Set<string>();
    for (const outcome of reference.trial.primaryOutcomes) {
      for (const parsed of parseEndpointsFromText(
        outcome.measure,
        outcome.timeFrame,
      )) {
        labels.add(formatMetricDisplay(parsed.metricName, parsed.timepoint));
      }
    }
    for (const label of labels) {
      const current = counts.get(label) ?? {
        count: 0,
        references: [],
        label,
      };
      counts.set(label, {
        count: current.count + 1,
        references: [...current.references, reference],
        label,
      });
    }
  }
  const ranked = Array.from(counts.values()).sort(
    (left, right) => right.count - left.count,
  );
  const winner = ranked[0];
  if (!winner) {
    return {
      primary: requiredField(
        "primary_endpoint",
        strategyBasisCopy.noPrimaryEndpoint,
      ),
      secondary: requiredField(
        "secondary_endpoints",
        strategyBasisCopy.noSecondaryUntilPrimary,
      ),
    };
  }
  const sources = winner.references.map((reference) =>
    trialSource(assessmentId, reference),
  );
  const secondaryLabels = ranked.slice(1).map((item) => item.label);
  return {
    primary: field(
      "primary_endpoint",
      winner.label,
      strategyBasisCopy.primaryFromTrials(
        winner.count,
        references.length,
        winner.label,
      ),
      "reference_trial",
      sources,
    ),
    secondary: secondaryLabels.length
      ? field(
          "secondary_endpoints",
          secondaryLabels.join("; "),
          strategyBasisCopy.secondaryFromTrials,
          "reference_trial",
          references.map((reference) => trialSource(assessmentId, reference)),
        )
      : requiredField(
          "secondary_endpoints",
          strategyBasisCopy.noSecondaryFromTrials,
        ),
  };
}

function studyDesignSuggestion(
  assessmentId: string,
  references: SavedReferenceTrial[],
) {
  if (!references.length) {
    return requiredField("study_design", strategyBasisCopy.noReferenceTrials);
  }
  const values = references.map((item) => {
    const design = item.trial.design;
    return [
      item.trial.studyType,
      design.allocation,
      design.interventionModel,
      design.primaryPurpose,
    ]
      .filter(Boolean)
      .join(" \u00b7 ");
  });
  const countByValue = new Map<string, number>();
  values.forEach((value) =>
    countByValue.set(value, (countByValue.get(value) ?? 0) + 1),
  );
  const winner = Array.from(countByValue.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0];
  if (!winner?.[0]) {
    return requiredField(
      "study_design",
      strategyBasisCopy.noStudyDesignMetadata,
    );
  }
  return field(
    "study_design",
    winner[0],
    strategyBasisCopy.sharedStudyDesign(winner[1], references.length),
    "reference_trial",
    references
      .filter((_, index) => values[index] === winner[0])
      .map((reference) => trialSource(assessmentId, reference)),
  );
}

function approvedEvidenceSuggestion(
  assessmentId: string,
  extractions: EvidenceExtraction[],
  key: "line_of_therapy",
) {
  const approved = extractions.flatMap((extraction) =>
    extraction.fields
      .filter(
        (item) =>
          item.field === key &&
          item.reviewStatus === "approved" &&
          item.reviewedValue !== null,
      )
      .map((item) => ({ extraction, item })),
  );
  const unique = Array.from(
    new Set(
      approved.map(({ item }) =>
        Array.isArray(item.reviewedValue)
          ? item.reviewedValue.join("; ")
          : String(item.reviewedValue),
      ),
    ),
  );
  if (unique.length !== 1) {
    return requiredField(
      key,
      unique.length
        ? strategyBasisCopy.multipleLineOfTherapy
        : strategyBasisCopy.noLineOfTherapy,
    );
  }
  return field(
    key,
    unique[0],
    strategyBasisCopy.approvedLineOfTherapy(approved.length),
    "approved_evidence",
    approved.map(({ extraction, item }) => ({
      id: item.id,
      type: "approved_evidence",
      label: `PMID ${item.pmid}`,
      href: `/assessments/${assessmentId}/evidence/review/${item.pmid}`,
      pmid: item.pmid,
      sourceText: item.sourceText,
      isMock: extraction.isMock,
    })),
  );
}

function approvedBenchmarkSuggestion(
  assessmentId: string,
  benchmark: HistoricalBenchmark | null,
) {
  if (!benchmark || benchmark.status !== "approved") {
    return requiredField(
      "historical_benchmark",
      strategyBasisCopy.benchmarkNotApproved,
    );
  }
  const selected = selectedBenchmarkMetrics(benchmark);
  const available = benchmark.summaries.filter((item) =>
    selected.some((metric) => metric.metricId === item.metricId),
  );
  if (!selected.length) {
    return requiredField(
      "historical_benchmark",
      strategyBasisCopy.benchmarkNoMetric,
    );
  }
  return field(
    "historical_benchmark",
    available
      .map(
        (item) =>
          `${item.displayName}: ${item.observedRange ?? missingValueCopy.notReported}`,
      )
      .join("; ") ||
      selected
        .map((item) => formatMetricDisplay(item.metricName, item.timepoint))
        .join("; "),
    strategyBasisCopy.benchmarkSelected,
    "approved_benchmark",
    selected.map((item) => {
      const summary = available.find((entry) => entry.metricId === item.metricId);
      return {
        id: `${benchmark.id}:${item.metricId}`,
        type: "approved_benchmark" as const,
        label: `${formatMetricDisplay(item.metricName, item.timepoint)} \u00b7 ${summary?.observedRange ?? missingValueCopy.notReported}`,
        href: `/assessments/${assessmentId}/benchmark`,
        isMock: benchmark.isMock,
      };
    }),
  );
}

function selectedBenchmarkMetrics(benchmark: HistoricalBenchmark | null) {
  if (!benchmark || benchmark.status !== "approved") return [];
  return (benchmark.metrics ?? []).filter(
    (item): item is BenchmarkMetric => item.status === "selected",
  );
}

function field(
  key: DevelopmentStrategyFieldKey,
  value: string | null,
  basis: string,
  sourceType: StrategySourceType,
  sources: StrategyTraceReference[],
): DevelopmentStrategyField {
  return {
    key,
    originalSuggestedValue: value,
    reviewedValue: value,
    basis,
    sourceType,
    sources,
    reviewStatus: "draft",
    modified: false,
  };
}

function requiredField(
  key: DevelopmentStrategyFieldKey,
  basis: string,
) {
  return field(key, null, basis, "user_input", []);
}

function assessmentSource(
  assessmentId: string,
  label: string,
): StrategyTraceReference {
  return {
    id: `${assessmentId}:${label}`,
    type: "assessment_input",
    label,
    href: `/assessments/${assessmentId}`,
  };
}

function trialSource(
  assessmentId: string,
  reference: SavedReferenceTrial,
): StrategyTraceReference {
  return {
    id: `${assessmentId}:${reference.trial.nctId}`,
    type: "reference_trial",
    label: `${reference.trial.nctId} \u00b7 ${reference.trial.briefTitle}`,
    href: reference.trial.source.url,
    nctId: reference.trial.nctId,
  };
}
