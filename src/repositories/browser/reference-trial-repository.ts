import type { ClinicalTrialSummary } from "@/domain/models";

export interface SavedReferenceTrial {
  assessmentId: string;
  trial: ClinicalTrialSummary;
  selectedAt: string;
}

export interface ReferenceTrialSelectionRepository {
  list(assessmentId: string): Promise<SavedReferenceTrial[]>;
  add(
    assessmentId: string,
    trial: ClinicalTrialSummary,
  ): Promise<SavedReferenceTrial[]>;
  remove(assessmentId: string, nctId: string): Promise<SavedReferenceTrial[]>;
}

const STORAGE_PREFIX = "cde:reference-trials:v1:";

export class LocalStorageReferenceTrialRepository
  implements ReferenceTrialSelectionRepository
{
  async list(assessmentId: string): Promise<SavedReferenceTrial[]> {
    return this.read(assessmentId);
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  private read(assessmentId: string): SavedReferenceTrial[] {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isSavedReferenceTrial);
    } catch {
      return [];
    }
  }

  async add(
    assessmentId: string,
    trial: ClinicalTrialSummary,
  ): Promise<SavedReferenceTrial[]> {
    const current = this.read(assessmentId);
    const withoutDuplicate = current.filter(
      (item) => item.trial.nctId !== trial.nctId,
    );
    const next = [
      ...withoutDuplicate,
      {
        assessmentId,
        trial,
        selectedAt: new Date().toISOString(),
      },
    ];
    this.save(assessmentId, next);
    return next;
  }

  async remove(
    assessmentId: string,
    nctId: string,
  ): Promise<SavedReferenceTrial[]> {
    const next = this.read(assessmentId).filter(
      (item) => item.trial.nctId !== nctId,
    );
    this.save(assessmentId, next);
    return next;
  }

  private save(assessmentId: string, trials: SavedReferenceTrial[]) {
    window.localStorage.setItem(
      storageKey(assessmentId),
      JSON.stringify(trials),
    );
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}

function isSavedReferenceTrial(
  value: unknown,
): value is SavedReferenceTrial {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SavedReferenceTrial>;
  return (
    typeof candidate.assessmentId === "string" &&
    typeof candidate.selectedAt === "string" &&
    Boolean(candidate.trial) &&
    typeof candidate.trial?.nctId === "string"
  );
}
