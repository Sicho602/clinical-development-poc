import type {
  EvidenceExtraction,
  EvidenceExtractionStatus,
  EvidenceFieldKey,
  EvidenceFieldValue,
  ExtractedEvidenceField,
} from "@/domain/models";

export type FieldReviewAction = "approve" | "edit" | "reject";

export interface FieldReviewInput {
  action: FieldReviewAction;
  value?: EvidenceFieldValue | null;
  unit?: string;
  sourceText?: string;
  reviewer: string;
}

export interface BrowserEvidenceExtractionRepository {
  list(
    assessmentId: string,
    isMock?: boolean,
  ): Promise<EvidenceExtraction[]>;
  get(
    assessmentId: string,
    pmid: string,
    isMock?: boolean,
  ): Promise<EvidenceExtraction | null>;
  save(extraction: EvidenceExtraction): Promise<EvidenceExtraction>;
  setStatus(
    assessmentId: string,
    pmid: string,
    isMock: boolean,
    status: EvidenceExtractionStatus,
    errorMessage?: string,
  ): Promise<EvidenceExtraction>;
  reviewField(
    assessmentId: string,
    pmid: string,
    isMock: boolean,
    field: EvidenceFieldKey,
    input: FieldReviewInput,
  ): Promise<EvidenceExtraction>;
}

const STORAGE_PREFIX = "cde:evidence-extractions:v1:";

export class LocalStorageEvidenceExtractionRepository
  implements BrowserEvidenceExtractionRepository
{
  async list(assessmentId: string, isMock?: boolean) {
    const records = this.read(assessmentId);
    return isMock === undefined
      ? records
      : records.filter((item) => item.isMock === isMock);
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  async get(assessmentId: string, pmid: string, isMock = false) {
    return (
      this.read(assessmentId).find(
        (item) => item.pmid === pmid && item.isMock === isMock,
      ) ?? null
    );
  }

  async save(extraction: EvidenceExtraction) {
    const current = this.read(extraction.assessmentId);
    const existing = current.find(
      (item) =>
        item.pmid === extraction.pmid &&
        item.isMock === extraction.isMock,
    );
    const merged = existing
      ? {
          ...extraction,
          fields: mergeReviewedFields(existing.fields, extraction.fields),
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        }
      : extraction;
    this.write(extraction.assessmentId, [
      ...current.filter(
        (item) =>
          !(
            item.pmid === extraction.pmid &&
            item.isMock === extraction.isMock
          ),
      ),
      merged,
    ]);
    return merged;
  }

  async setStatus(
    assessmentId: string,
    pmid: string,
    isMock: boolean,
    status: EvidenceExtractionStatus,
    errorMessage?: string,
  ) {
    const current = this.read(assessmentId);
    const existing = current.find(
      (item) => item.pmid === pmid && item.isMock === isMock,
    );
    const now = new Date().toISOString();
    const mode = isMock ? "mock" : "real";
    const nextExtraction: EvidenceExtraction = {
      id: existing?.id ?? `${assessmentId}:${mode}:${pmid}`,
      assessmentId,
      pmid,
      fields: existing?.fields ?? [],
      issues: existing?.issues ?? [],
      extractionStatus: status,
      isMock,
      provider: existing?.provider,
      model: existing?.model,
      extractedAt: existing?.extractedAt,
      errorMessage,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.write(assessmentId, [
      ...current.filter(
        (item) => !(item.pmid === pmid && item.isMock === isMock),
      ),
      nextExtraction,
    ]);
    return nextExtraction;
  }

  async reviewField(
    assessmentId: string,
    pmid: string,
    isMock: boolean,
    field: EvidenceFieldKey,
    input: FieldReviewInput,
  ) {
    const current = this.read(assessmentId);
    const existingExtraction = current.find(
      (item) => item.pmid === pmid && item.isMock === isMock,
    );
    const existingField = existingExtraction?.fields.find(
      (item) => item.field === field,
    );
    const now = new Date().toISOString();
    const mode = isMock ? "mock" : "real";
    const nextField: ExtractedEvidenceField = {
      id:
        existingField?.id ??
        `${assessmentId}:${mode}:${pmid}:${field}`,
      field,
      originalAiValue: existingField?.originalAiValue ?? null,
      originalAiUnit: existingField?.originalAiUnit,
      reviewedValue:
        input.action === "reject"
          ? null
          : input.action === "approve"
            ? existingField?.reviewedValue ??
              existingField?.originalAiValue ??
              null
            : input.value ?? null,
      reviewedUnit:
        input.action === "edit"
          ? input.unit
          : existingField?.reviewedUnit ?? existingField?.originalAiUnit,
      pmid,
      sourceText:
        input.sourceText ?? existingField?.sourceText ?? "",
      reviewStatus:
        input.action === "reject" ? "rejected" : "approved",
      modified:
        input.action === "edit" ||
        (existingField?.modified ?? false),
      reviewer: input.reviewer,
      reviewedAt: now,
    };
    const extraction: EvidenceExtraction = {
      id:
        existingExtraction?.id ??
        `${assessmentId}:${mode}:${pmid}`,
      assessmentId,
      pmid,
      fields: [
        ...(existingExtraction?.fields ?? []).filter(
          (item) => item.field !== field,
        ),
        nextField,
      ],
      issues: existingExtraction?.issues ?? [],
      extractionStatus:
        existingExtraction?.extractionStatus ?? "not_extracted",
      isMock,
      provider: existingExtraction?.provider,
      model: existingExtraction?.model,
      extractedAt: existingExtraction?.extractedAt,
      errorMessage: existingExtraction?.errorMessage,
      createdAt: existingExtraction?.createdAt ?? now,
      updatedAt: now,
    };
    this.write(assessmentId, [
      ...current.filter(
        (item) => !(item.pmid === pmid && item.isMock === isMock),
      ),
      extraction,
    ]);
    return extraction;
  }

  private read(assessmentId: string): EvidenceExtraction[] {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      return Array.isArray(parsed)
        ? (parsed as EvidenceExtraction[]).map((item) => ({
            ...item,
            issues: item.issues ?? [],
            isMock: item.isMock ?? false,
          }))
        : [];
    } catch {
      return [];
    }
  }

  private write(
    assessmentId: string,
    extractions: EvidenceExtraction[],
  ) {
    window.localStorage.setItem(
      storageKey(assessmentId),
      JSON.stringify(extractions),
    );
  }
}

function mergeReviewedFields(
  existing: ExtractedEvidenceField[],
  incoming: ExtractedEvidenceField[],
) {
  const existingByKey = new Map(existing.map((item) => [item.field, item]));
  return incoming.map((item) => {
    const reviewed = existingByKey.get(item.field);
    return reviewed && reviewed.reviewStatus !== "ai_draft"
      ? reviewed
      : item;
  });
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
