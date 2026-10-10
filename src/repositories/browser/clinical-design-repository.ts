import type { ClinicalDesignComparison } from "@/domain/models";
import type { ClinicalDesignRepository } from "@/domain/contracts";

const STORAGE_PREFIX = "cde:clinical-design:v1:";

export class LocalStorageClinicalDesignRepository
  implements ClinicalDesignRepository
{
  async getByAssessmentId(
    assessmentId: string,
  ): Promise<ClinicalDesignComparison | null> {
    return this.read(assessmentId);
  }

  async save(record: ClinicalDesignComparison): Promise<ClinicalDesignComparison> {
    window.localStorage.setItem(
      storageKey(record.assessmentId),
      JSON.stringify(record),
    );
    return record;
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  private read(assessmentId: string): ClinicalDesignComparison | null {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) return null;
    try {
      const parsed = JSON.parse(rawValue) as ClinicalDesignComparison;
      if (!parsed || !Array.isArray(parsed.nctIds) || !Array.isArray(parsed.profiles)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
