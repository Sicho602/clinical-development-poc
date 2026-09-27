import type {
  BenchmarkEndpointType,
  BenchmarkEvidenceDecision,
  BenchmarkMetric,
  BenchmarkMetricObservation,
  BenchmarkMetricSourceType,
  BenchmarkMetricSummary,
  BenchmarkMetricType,
  EvidenceExtraction,
  EvidenceFieldValue,
  OutcomeMeasure,
} from "@/domain/models";
import type { SavedPublicationEvidence } from "@/repositories/browser/publication-selection-repository";
import type { SavedReferenceTrial } from "@/repositories/browser/reference-trial-repository";

export interface BenchmarkDiscovery {
  metrics: BenchmarkMetric[];
  observations: BenchmarkMetricObservation[];
}

interface KnownMetricPattern {
  name: string;
  type: BenchmarkMetricType;
  pattern: RegExp;
}

interface ParsedEndpoint {
  metricName: string;
  displayName: string;
  metricType: BenchmarkMetricType;
  timepoint: string | null;
}

const knownMetricPatterns: KnownMetricPattern[] = [
  { name: "EASI-75", type: "RESPONSE_RATE", pattern: /\beasi[\s-]?75\b/i },
  { name: "EASI-90", type: "RESPONSE_RATE", pattern: /\beasi[\s-]?90\b/i },
  { name: "EASI-50", type: "RESPONSE_RATE", pattern: /\beasi[\s-]?50\b/i },
  {
    name: "EASI Change from Baseline",
    type: "CONTINUOUS_CHANGE",
    pattern:
      /\beasi\b[\s\S]{0,40}\b(change|reduction|improvement|decrease)\b|\b(change|reduction|improvement|decrease)[\s\S]{0,40}\beasi\b/i,
  },
  {
    name: "IGA 0/1",
    type: "BINARY_ENDPOINT",
    pattern:
      /\b(?:viga|iga)\b[\s\S]{0,24}(?:0\s*\/\s*1|0 or 1|clear or almost clear)/i,
  },
  {
    name: "PP-NRS",
    type: "CONTINUOUS_CHANGE",
    pattern: /\bpp[\s-]?nrs\b|\bpeak pruritus\b/i,
  },
  { name: "HbA1c", type: "CONTINUOUS_CHANGE", pattern: /\bhba1c\b/i },
  {
    name: "FPG",
    type: "CONTINUOUS_CHANGE",
    pattern: /\bfpg\b|\bfasting plasma glucose\b/i,
  },
  {
    name: "Weight Change",
    type: "CONTINUOUS_CHANGE",
    pattern:
      /\b(?:body )?weight(?:\s+(?:change|loss|reduction))\b|\bpercent(?:age)?\s+weight\b/i,
  },
  {
    name: "SBP",
    type: "CONTINUOUS_CHANGE",
    pattern: /\bsystolic blood pressure\b|\bsbp\b/i,
  },
  {
    name: "DBP",
    type: "CONTINUOUS_CHANGE",
    pattern: /\bdiastolic blood pressure\b|\bdbp\b/i,
  },
  {
    name: "ORR",
    type: "RESPONSE_RATE",
    pattern: /\bobjective response rate\b|\boverall response rate\b|\borr\b/i,
  },
  {
    name: "CR",
    type: "RESPONSE_RATE",
    pattern: /\bcomplete response(?: rate)?\b/,
  },
  {
    name: "PR",
    type: "RESPONSE_RATE",
    pattern: /\bpartial response(?: rate)?\b/,
  },
  {
    name: "DCR",
    type: "RESPONSE_RATE",
    pattern: /\bdisease control rate\b|\bdcr\b/i,
  },
  {
    name: "DOR",
    type: "TIME_TO_EVENT",
    pattern: /\bduration of response\b|\bdor\b/i,
  },
  {
    name: "PFS",
    type: "TIME_TO_EVENT",
    pattern: /\bprogression[\s-]?free survival\b|\bpfs\b/i,
  },
  {
    name: "OS",
    type: "TIME_TO_EVENT",
    pattern: /\boverall survival\b/,
  },
];

const outcomeFieldMetrics: Partial<
  Record<string, { name: string; type: BenchmarkMetricType }>
> = {
  orr: { name: "ORR", type: "RESPONSE_RATE" },
  pfs: { name: "PFS", type: "TIME_TO_EVENT" },
  os: { name: "OS", type: "TIME_TO_EVENT" },
  dor: { name: "DOR", type: "TIME_TO_EVENT" },
};

const endpointTypeRank: Record<BenchmarkEndpointType, number> = {
  PRIMARY: 0,
  SECONDARY: 1,
  EXPLORATORY: 2,
  UNKNOWN: 3,
};

const sourceTypeRank: Record<BenchmarkMetricSourceType, number> = {
  approved_evidence: 0,
  reference_trial: 1,
  user_defined: 2,
};

export function buildMetricId(metricName: string, timepoint: string | null) {
  return `${slugify(metricName)}__${slugify(timepoint ?? "unspecified")}`;
}

export function formatMetricDisplay(
  metricName: string,
  timepoint: string | null,
) {
  return timepoint ? `${metricName} at ${timepoint}` : metricName;
}

export function parseTimepoint(
  ...texts: Array<string | undefined | null>
): string | null {
  const joined = texts.filter(Boolean).join(" ");
  if (!joined.trim()) return null;
  const week = joined.match(/\b(?:at\s+)?(?:weeks?|wks?)\s*(\d+)\b/i);
  if (week) return `Week ${week[1]}`;
  const month = joined.match(/\b(?:at\s+)?(?:months?|mos?)\s*(\d+)\b/i);
  if (month) return `Month ${month[1]}`;
  const year = joined.match(/\b(?:at\s+)?(?:years?|yrs?)\s*(\d+)\b/i);
  if (year) return `Year ${year[1]}`;
  const day = joined.match(/\b(?:at\s+)?(?:days?)\s*(\d+)\b/i);
  if (day) return `Day ${day[1]}`;
  const countThenUnit = joined.match(
    /\b(\d+)\s*(?:weeks?|wks?|months?|mos?|years?|yrs?|days?)\b/i,
  );
  if (countThenUnit) {
    const unit = countThenUnit[0].toLowerCase();
    if (unit.includes("week") || unit.includes("wk")) {
      return `Week ${countThenUnit[1]}`;
    }
    if (unit.includes("month") || unit.includes("mo")) {
      return `Month ${countThenUnit[1]}`;
    }
    if (unit.includes("year") || unit.includes("yr")) {
      return `Year ${countThenUnit[1]}`;
    }
    return `Day ${countThenUnit[1]}`;
  }
  return null;
}

export function parseEndpointsFromText(
  text: string,
  timeFrame?: string | null,
): ParsedEndpoint[] {
  const fragments = splitEndpointText(text);
  const parsed = fragments.flatMap((fragment) =>
    parseSingleEndpoint(fragment, timeFrame),
  );
  return uniqueParsed(parsed);
}

export function discoverBenchmarkMetrics(
  referenceTrials: SavedReferenceTrial[],
  extractions: EvidenceExtraction[],
  publications: SavedPublicationEvidence[],
  persistedMetrics: BenchmarkMetric[] = [],
): BenchmarkDiscovery {
  const observations: BenchmarkMetricObservation[] = [];

  for (const reference of referenceTrials) {
    observations.push(
      ...observationsFromTrial(reference, "PRIMARY", reference.trial.primaryOutcomes),
    );
    observations.push(
      ...observationsFromTrial(
        reference,
        "SECONDARY",
        reference.trial.secondaryOutcomes ?? [],
      ),
    );
  }

  const publicationByPmid = new Map(
    publications.map((item) => [item.publication.pmid, item]),
  );
  for (const extraction of extractions) {
    observations.push(
      ...observationsFromApprovedEvidence(
        extraction,
        publicationByPmid.get(extraction.pmid),
      ),
    );
  }

  for (const metric of persistedMetrics.filter(
    (item) => item.sourceType === "user_defined",
  )) {
    observations.push(observationFromUserDefined(metric));
  }

  const metrics = mergePersistedMetrics(
    metricsFromObservations(observations),
    persistedMetrics,
  );

  return { metrics, observations };
}

export function mergePersistedMetrics(
  discovered: BenchmarkMetric[],
  persisted: BenchmarkMetric[],
): BenchmarkMetric[] {
  const persistedById = new Map(persisted.map((item) => [item.metricId, item]));
  const merged = discovered.map((item) => {
    const saved = persistedById.get(item.metricId);
    if (!saved) return item;
    return {
      ...item,
      status: saved.status,
      createdBy: saved.createdBy ?? item.createdBy,
      createdAt: saved.createdAt ?? item.createdAt,
    };
  });
  const discoveredIds = new Set(discovered.map((item) => item.metricId));
  const userDefined = persisted.filter(
    (item) =>
      item.sourceType === "user_defined" && !discoveredIds.has(item.metricId),
  );
  return [...merged, ...userDefined];
}

export function buildBenchmarkSummaries(
  metrics: BenchmarkMetric[],
  observations: BenchmarkMetricObservation[],
  decisions: BenchmarkEvidenceDecision[],
): BenchmarkMetricSummary[] {
  const decisionByObservation = new Map(
    decisions.map((item) => [item.observationId, item]),
  );
  return metrics
    .filter((metric) => metric.status === "selected")
    .map((metric) => {
      const rows = observations.filter((item) => item.metricId === metric.metricId);
      const included = rows.filter(
        (item) => decisionByObservation.get(item.observationId)?.decision === "included",
      );
      const excluded = rows.filter(
        (item) => decisionByObservation.get(item.observationId)?.decision === "excluded",
      );
      const numeric = included
        .map((item) => ({
          value: parseNumericValue(item.value),
          unit: item.unit,
        }))
        .filter((item): item is { value: number; unit: string | null } =>
          item.value !== null,
        );
      const populations = uniqueStrings(
        included
          .map((item) => item.population)
          .filter((item): item is string => Boolean(item)),
      );
      return {
        metricId: metric.metricId,
        metricName: metric.metricName,
        displayName: formatMetricDisplay(metric.metricName, metric.timepoint),
        metricType: metric.metricType,
        timepoint: metric.timepoint,
        populations,
        includedEvidenceIds: included.map((item) => item.observationId),
        excludedEvidenceIds: excluded.map((item) => item.observationId),
        observedRange: formatObservedRange(numeric.map((item) => item.value)),
        studyCount: included.length,
        totalN: sumSampleSize(included),
        unit: majorityUnit(numeric.map((item) => item.unit)),
      };
    });
}

export function formatEvidenceValue(value: EvidenceFieldValue | null) {
  if (value === null || value === undefined || value === "") {
    return "확인되지 않음";
  }
  return Array.isArray(value) ? value.join("; ") : String(value);
}

export function createUserDefinedMetric(input: {
  metricName: string;
  timepoint?: string | null;
  metricType?: BenchmarkMetricType;
  population?: string | null;
  unit?: string | null;
  value?: string | number | null;
  createdBy: string;
}): BenchmarkMetric {
  const metricName = input.metricName.trim();
  const timepoint = normalizeTimepointInput(input.timepoint);
  return {
    metricId: buildMetricId(metricName, timepoint),
    metricName,
    displayName: formatMetricDisplay(metricName, timepoint),
    metricType: input.metricType ?? inferMetricType(metricName),
    value: input.value ?? null,
    unit: emptyToNull(input.unit),
    timepoint,
    population: emptyToNull(input.population),
    endpointType: "UNKNOWN",
    sourceEvidenceIds: [],
    includedStudies: ["User Defined"],
    status: "selected",
    sourceType: "user_defined",
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
}

function observationsFromTrial(
  reference: SavedReferenceTrial,
  endpointType: BenchmarkEndpointType,
  outcomes: OutcomeMeasure[],
): BenchmarkMetricObservation[] {
  const population = trialPopulation(reference);
  return outcomes.flatMap((outcome, index) => {
    const parsed = parseEndpointsFromText(outcome.measure, outcome.timeFrame);
    return parsed.map((item) => {
      const metricId = buildMetricId(item.metricName, item.timepoint);
      return {
        observationId: `trial:${reference.trial.nctId}:${metricId}:${endpointType}:${index}`,
        metricId,
        metricName: item.metricName,
        displayName: formatMetricDisplay(item.metricName, item.timepoint),
        metricType: item.metricType,
        value: null,
        unit: null,
        timepoint: item.timepoint,
        population,
        endpointType,
        sourceType: "reference_trial" as const,
        sourceLabel: reference.trial.nctId,
        studyLabel: reference.trial.briefTitle,
        nctId: reference.trial.nctId,
        sourceText: [outcome.measure, outcome.timeFrame, outcome.description]
          .filter(Boolean)
          .join(" · "),
        treatment: reference.trial.interventions[0] ?? null,
        sampleSize: reference.trial.enrollment ?? null,
      };
    });
  });
}

function observationsFromApprovedEvidence(
  extraction: EvidenceExtraction,
  publication?: SavedPublicationEvidence,
): BenchmarkMetricObservation[] {
  const approved = extraction.fields.filter(
    (item) => item.reviewStatus === "approved" && hasReviewedValue(item.reviewedValue),
  );
  const population = stringField(approved, "population");
  const lineOfTherapy = stringField(approved, "line_of_therapy");
  const treatment = stringField(approved, "treatment");
  const sampleSize = parseNumericValue(fieldValue(approved, "sample_size"));
  const studyLabel =
    publication?.publication.title ?? `PMID ${extraction.pmid}`;
  const observations: BenchmarkMetricObservation[] = [];

  for (const field of approved) {
    if (field.field === "primary_endpoint" || field.field === "secondary_endpoints") {
      const texts = Array.isArray(field.reviewedValue)
        ? field.reviewedValue
        : [String(field.reviewedValue)];
      for (const text of texts) {
        for (const parsed of parseEndpointsFromText(text, field.sourceText)) {
          const metricId = buildMetricId(parsed.metricName, parsed.timepoint);
          observations.push({
            observationId: `evidence:${field.id}:${metricId}`,
            metricId,
            metricName: parsed.metricName,
            displayName: formatMetricDisplay(parsed.metricName, parsed.timepoint),
            metricType: parsed.metricType,
            value: null,
            unit: field.reviewedUnit ?? null,
            timepoint: parsed.timepoint,
            population,
            endpointType:
              field.field === "primary_endpoint" ? "PRIMARY" : "SECONDARY",
            sourceType: "approved_evidence",
            sourceEvidenceId: field.id,
            sourceLabel: `PMID ${field.pmid}`,
            studyLabel,
            pmid: field.pmid,
            sourceText: field.sourceText,
            lineOfTherapy,
            treatment,
            sampleSize,
          });
        }
      }
      continue;
    }

    const mapped = outcomeFieldMetrics[field.field];
    if (!mapped) continue;
    const timepoint = parseTimepoint(field.sourceText, String(field.reviewedValue ?? ""));
    const metricId = buildMetricId(mapped.name, timepoint);
    observations.push({
      observationId: `evidence:${field.id}:${metricId}`,
      metricId,
      metricName: mapped.name,
      displayName: formatMetricDisplay(mapped.name, timepoint),
      metricType: mapped.type,
      value: scalarValue(field.reviewedValue),
      unit: field.reviewedUnit ?? null,
      timepoint,
      population,
      endpointType: "UNKNOWN",
      sourceType: "approved_evidence",
      sourceEvidenceId: field.id,
      sourceLabel: `PMID ${field.pmid}`,
      studyLabel,
      pmid: field.pmid,
      sourceText: field.sourceText,
      lineOfTherapy,
      treatment,
      sampleSize,
    });
  }

  return observations;
}

function observationFromUserDefined(
  metric: BenchmarkMetric,
): BenchmarkMetricObservation {
  return {
    observationId: `user:${metric.metricId}`,
    metricId: metric.metricId,
    metricName: metric.metricName,
    displayName: metric.displayName,
    metricType: metric.metricType,
    value: metric.value ?? null,
    unit: metric.unit ?? null,
    timepoint: metric.timepoint,
    population: metric.population ?? null,
    endpointType: metric.endpointType,
    sourceType: "user_defined",
    sourceLabel: "User Defined",
    studyLabel: "직접 추가한 기준 지표",
  };
}

function metricsFromObservations(
  observations: BenchmarkMetricObservation[],
): BenchmarkMetric[] {
  const grouped = new Map<string, BenchmarkMetricObservation[]>();
  for (const observation of observations) {
    const current = grouped.get(observation.metricId) ?? [];
    current.push(observation);
    grouped.set(observation.metricId, current);
  }
  return Array.from(grouped.entries()).map(([metricId, rows]) => {
    const first = rows[0];
    const sourceTypes = uniqueStrings(rows.map((item) => item.sourceType));
    return {
      metricId,
      metricName: first.metricName,
      displayName: formatMetricDisplay(first.metricName, first.timepoint),
      metricType: first.metricType,
      timepoint: first.timepoint,
      endpointType: preferredEndpointType(rows.map((item) => item.endpointType)),
      sourceEvidenceIds: uniqueStrings(
        rows
          .map((item) => item.sourceEvidenceId)
          .filter((item): item is string => Boolean(item)),
      ),
      includedStudies: uniqueStrings(rows.map((item) => item.studyLabel)),
      status: "candidate" as const,
      sourceType: preferredSourceType(sourceTypes as BenchmarkMetricSourceType[]),
    };
  });
}

function parseSingleEndpoint(
  text: string,
  timeFrame?: string | null,
): ParsedEndpoint[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const timepoint = parseTimepoint(trimmed, timeFrame);
  const matches = knownMetricPatterns
    .filter((item) => item.pattern.test(trimmed))
    .map((item) => ({
      metricName: item.name,
      displayName: formatMetricDisplay(item.name, timepoint),
      metricType: item.type,
      timepoint,
    }));
  if (matches.length) return matches;
  const fallbackName = fallbackMetricName(trimmed);
  return [
    {
      metricName: fallbackName,
      displayName: formatMetricDisplay(fallbackName, timepoint),
      metricType: inferMetricType(fallbackName),
      timepoint,
    },
  ];
}

function splitEndpointText(text: string) {
  return text
    .split(/\n|;|\u2022|\||\/(?=\s)|,(?=\s*(?:and\s+)?[A-Z가-힣])|\band\b/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 1);
}

function fallbackMetricName(text: string) {
  const cleaned = text
    .replace(
      /^(?:proportion|percentage|percent|rate) of (?:participants|patients|subjects) (?:with|achieving|who achieve|who achieved)\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || text).slice(0, 80);
}

function inferMetricType(metricName: string): BenchmarkMetricType {
  const known = knownMetricPatterns.find((item) =>
    item.pattern.test(metricName),
  );
  return known?.type ?? "OTHER";
}

function trialPopulation(reference: SavedReferenceTrial) {
  return reference.trial.conditions.filter(Boolean).join("; ") || null;
}

function fieldValue(
  fields: EvidenceExtraction["fields"],
  key: string,
): EvidenceFieldValue | null {
  return fields.find((item) => item.field === key)?.reviewedValue ?? null;
}

function stringField(fields: EvidenceExtraction["fields"], key: string) {
  const value = fieldValue(fields, key);
  if (value === null || value === undefined || value === "") return null;
  return Array.isArray(value) ? value.join("; ") : String(value);
}

function scalarValue(value: EvidenceFieldValue | null): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.filter(Boolean).join("; ") || null;
  return value;
}

function hasReviewedValue(value: EvidenceFieldValue | null) {
  if (value === null || value === undefined || value === "") return false;
  return Array.isArray(value) ? value.some(Boolean) : true;
}

function parseNumericValue(value: EvidenceFieldValue | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatObservedRange(values: number[]) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? String(min) : `${min}–${max}`;
}

function sumSampleSize(rows: BenchmarkMetricObservation[]) {
  const values = rows
    .map((item) => item.sampleSize)
    .filter((item): item is number => typeof item === "number");
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + item, 0);
}

function majorityUnit(units: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const unit of units) {
    if (!unit) continue;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  return (
    Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null
  );
}

function preferredEndpointType(types: BenchmarkEndpointType[]) {
  return [...types].sort(
    (left, right) => endpointTypeRank[left] - endpointTypeRank[right],
  )[0] ?? "UNKNOWN";
}

function preferredSourceType(types: BenchmarkMetricSourceType[]) {
  return [...types].sort(
    (left, right) => sourceTypeRank[left] - sourceTypeRank[right],
  )[0] ?? "approved_evidence";
}

function uniqueParsed(items: ParsedEndpoint[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.metricName}::${item.timepoint ?? "unspecified"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "metric"
  );
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTimepointInput(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return parseTimepoint(trimmed) ?? trimmed;
}

export function isLegacyOncologyBenchmark(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as { metrics?: unknown; summaries?: unknown };
  if (Array.isArray(record.metrics)) return false;
  const summaries = record.summaries;
  if (!Array.isArray(summaries)) return false;
  return summaries.some((item) => {
    const metric = (item as { metric?: unknown }).metric;
    return (
      metric === "ORR" ||
      metric === "CR" ||
      metric === "DCR" ||
      metric === "PFS" ||
      metric === "OS" ||
      metric === "DOR"
    );
  });
}
