import type { StrategyRepository } from "@/domain/contracts";
import type {
  DevelopmentStrategy,
  DevelopmentStrategyField,
  DevelopmentStrategyFieldKey,
  StrategyFieldReviewStatus,
} from "@/domain/models";

const STORAGE_PREFIX = "cde:development-strategy:v1:";

export class LocalStorageDevelopmentStrategyRepository
  implements StrategyRepository
{
  async getByAssessmentId(assessmentId: string) {
    const raw = window.localStorage.getItem(storageKey(assessmentId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DevelopmentStrategy;
    } catch {
      return null;
    }
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  async save(strategy: DevelopmentStrategy) {
    window.localStorage.setItem(
      storageKey(strategy.assessmentId),
      JSON.stringify(strategy),
    );
    return strategy;
  }

  async reviewField(
    assessmentId: string,
    key: DevelopmentStrategyFieldKey,
    status: StrategyFieldReviewStatus,
    reviewer: string,
    reviewedValue?: string | null,
  ) {
    const strategy = await this.getByAssessmentId(assessmentId);
    if (!strategy) throw new Error("Development Strategy not found.");
    const now = new Date().toISOString();
    return this.save({
      ...strategy,
      fields: strategy.fields.map((field): DevelopmentStrategyField => {
        if (field.key !== key) return field;
        const nextValue =
          status === "rejected"
            ? null
            : reviewedValue === undefined
              ? field.originalSuggestedValue
              : reviewedValue;
        return {
          ...field,
          reviewedValue: nextValue,
          reviewStatus: status,
          modified:
            reviewedValue !== undefined &&
            reviewedValue !== field.originalSuggestedValue,
          reviewer,
          reviewedAt: now,
          sourceType:
            reviewedValue !== undefined && field.sourceType !== "user_input"
              ? "user_input"
              : field.sourceType,
        };
      }),
      status: "draft",
      reviewer: undefined,
      reviewedAt: undefined,
      approvedAt: undefined,
      updatedAt: now,
    });
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
