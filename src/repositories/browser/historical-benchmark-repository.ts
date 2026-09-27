import type { HistoricalBenchmarkRepository } from "@/domain/contracts";
import type {
  BenchmarkDecision,
  BenchmarkExclusionReason,
  BenchmarkMetric,
  HistoricalBenchmark,
} from "@/domain/models";
import { isLegacyOncologyBenchmark } from "@/features/benchmark/benchmark-utils";

const STORAGE_PREFIX = "cde:historical-benchmark:v2:";
const LEGACY_STORAGE_PREFIX = "cde:historical-benchmark:v1:";

export class LocalStorageHistoricalBenchmarkRepository
  implements HistoricalBenchmarkRepository
{
  async getByAssessmentId(assessmentId: string, isMock?: boolean) {
    const records = this.read(assessmentId);
    if (isMock === undefined) return records[0] ?? null;
    return records.find((item) => item.isMock === isMock) ?? null;
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
    window.localStorage.removeItem(legacyStorageKey(assessmentId));
  }

  async save(benchmark: HistoricalBenchmark) {
    const current = this.read(benchmark.assessmentId);
    this.write(benchmark.assessmentId, [
      ...current.filter((item) => item.isMock !== benchmark.isMock),
      benchmark,
    ]);
    return benchmark;
  }

  async updateObservationDecision(
    assessmentId: string,
    isMock: boolean,
    observationId: string,
    metricId: string,
    decision: BenchmarkDecision,
    reviewer: string,
    exclusionReason?: BenchmarkExclusionReason,
  ) {
    const now = new Date().toISOString();
    const existing =
      (await this.getByAssessmentId(assessmentId, isMock)) ??
      createEmptyBenchmark(assessmentId, isMock);
    return this.save({
      ...existing,
      decisions: [
        ...existing.decisions.filter((item) => item.observationId !== observationId),
        {
          observationId,
          metricId,
          decision,
          exclusionReason:
            decision === "excluded" ? exclusionReason : undefined,
          decidedBy: reviewer,
          decidedAt: now,
        },
      ],
      status: "draft",
      reviewer: undefined,
      reviewedAt: undefined,
      updatedAt: now,
    });
  }

  async saveMetrics(
    assessmentId: string,
    isMock: boolean,
    metrics: BenchmarkMetric[],
  ) {
    const now = new Date().toISOString();
    const existing =
      (await this.getByAssessmentId(assessmentId, isMock)) ??
      createEmptyBenchmark(assessmentId, isMock);
    return this.save({
      ...existing,
      metrics,
      status: "draft",
      reviewer: undefined,
      reviewedAt: undefined,
      updatedAt: now,
    });
  }

  private read(assessmentId: string): HistoricalBenchmark[] {
    const raw = window.localStorage.getItem(storageKey(assessmentId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isGenericBenchmark);
    } catch {
      return [];
    }
  }

  private write(assessmentId: string, records: HistoricalBenchmark[]) {
    window.localStorage.setItem(
      storageKey(assessmentId),
      JSON.stringify(records),
    );
  }
}

export function createEmptyBenchmark(
  assessmentId: string,
  isMock: boolean,
): HistoricalBenchmark {
  const now = new Date().toISOString();
  return {
    id: `${assessmentId}:${isMock ? "mock" : "real"}:benchmark`,
    assessmentId,
    metrics: [],
    decisions: [],
    summaries: [],
    status: "draft",
    isMock,
    createdAt: now,
    updatedAt: now,
  };
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}

function legacyStorageKey(assessmentId: string) {
  return `${LEGACY_STORAGE_PREFIX}${assessmentId}`;
}

function isGenericBenchmark(value: unknown): value is HistoricalBenchmark {
  if (!value || typeof value !== "object") return false;
  if (isLegacyOncologyBenchmark(value)) return false;
  const record = value as Partial<HistoricalBenchmark>;
  return Array.isArray(record.metrics) && Array.isArray(record.decisions);
}
