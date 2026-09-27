import type {
  ExtractionGoldStandard,
  ExtractionValidationErrorType,
  ExtractionValidationResult,
  EvidenceFieldKey,
  EvidenceFieldValue,
} from "@/domain/models";

export interface GoldStandardInput {
  assessmentId: string;
  pmid: string;
  isMock: boolean;
  field: EvidenceFieldKey;
  aiValue: EvidenceFieldValue | null;
  aiUnit?: string;
  aiSourceText?: string;
  humanValue: EvidenceFieldValue | null;
  humanUnit?: string;
  humanSourceText?: string;
  result: ExtractionValidationResult;
  errorType?: ExtractionValidationErrorType;
  reviewer: string;
}

const STORAGE_PREFIX = "cde:extraction-validation:v1:";

export class LocalStorageExtractionValidationRepository {
  async list(
    assessmentId: string,
    isMock?: boolean,
  ): Promise<ExtractionGoldStandard[]> {
    const records = this.read(assessmentId);
    return isMock === undefined
      ? records
      : records.filter((item) => item.isMock === isMock);
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  async save(input: GoldStandardInput) {
    const current = this.read(input.assessmentId);
    const record: ExtractionGoldStandard = {
      ...input,
      id: `${input.assessmentId}:${input.isMock ? "mock" : "real"}:${input.pmid}:${input.field}`,
      reviewedAt: new Date().toISOString(),
    };
    const next = [
      ...current.filter(
        (item) =>
          !(
            item.pmid === input.pmid &&
            item.field === input.field &&
            item.isMock === input.isMock
          ),
      ),
      record,
    ];
    window.localStorage.setItem(
      storageKey(input.assessmentId),
      JSON.stringify(next),
    );
    return record;
  }

  private read(assessmentId: string): ExtractionGoldStandard[] {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      return Array.isArray(parsed)
        ? (parsed as ExtractionGoldStandard[]).map((item) => ({
            ...item,
            isMock: item.isMock ?? false,
          }))
        : [];
    } catch {
      return [];
    }
  }
}

export function summarizeExtractionValidation(
  records: ExtractionGoldStandard[],
) {
  const evaluated = records.filter(
    (item) => item.result !== "unreviewed",
  );
  const count = (result: ExtractionValidationResult) =>
    evaluated.filter((item) => item.result === result).length;
  const correct = count("correct");
  const notReportedCorrect = count("not_reported_correct");
  return {
    totalFieldsEvaluated: evaluated.length,
    correct,
    incorrect: count("incorrect"),
    missed: count("missed"),
    unsupported: count("unsupported"),
    sourceMismatch: count("source_mismatch"),
    notReportedCorrect,
    exactMatchRate: evaluated.length
      ? ((correct + notReportedCorrect) / evaluated.length) * 100
      : 0,
    errorTypes: evaluated.reduce<
      Partial<Record<ExtractionValidationErrorType, number>>
    >((counts, item) => {
      if (item.errorType) {
        counts[item.errorType] = (counts[item.errorType] ?? 0) + 1;
      }
      return counts;
    }, {}),
  };
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
