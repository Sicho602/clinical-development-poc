import type { SearchLog } from "@/domain/models";

export interface BrowserSearchLogRepository {
  append(
    log: Omit<SearchLog, "id" | "searchedAt">,
  ): Promise<SearchLog>;
  list(assessmentId: string): Promise<SearchLog[]>;
}

const STORAGE_PREFIX = "cde:search-logs:v1:";

export class LocalStorageSearchLogRepository
  implements BrowserSearchLogRepository
{
  async append(
    input: Omit<SearchLog, "id" | "searchedAt">,
  ): Promise<SearchLog> {
    const current = this.read(input.assessmentId);
    const log: SearchLog = {
      ...input,
      id: crypto.randomUUID(),
      searchedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      storageKey(input.assessmentId),
      JSON.stringify([...current, log]),
    );
    return log;
  }

  async list(assessmentId: string): Promise<SearchLog[]> {
    return this.read(assessmentId);
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }

  private read(assessmentId: string): SearchLog[] {
    const rawValue = window.localStorage.getItem(storageKey(assessmentId));
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue) as unknown;
      return Array.isArray(parsed) ? (parsed as SearchLog[]) : [];
    } catch {
      return [];
    }
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}
