import type { SampleSizeRepository } from "@/domain/contracts";
import type { SampleSizeScenario } from "@/domain/models";

const STORAGE_PREFIX = "cde:sample-size:v1:";

export class LocalStorageSampleSizeRepository implements SampleSizeRepository {
  async list(assessmentId: string) {
    return read(assessmentId);
  }

  async save(scenario: SampleSizeScenario) {
    const current = read(scenario.assessmentId);
    write(scenario.assessmentId, [
      ...current.filter(
        (item) => item.calculationId !== scenario.calculationId,
      ),
      scenario,
    ]);
    return scenario;
  }

  async remove(assessmentId: string, calculationId: string) {
    write(
      assessmentId,
      read(assessmentId).filter((item) => item.calculationId !== calculationId),
    );
  }

  async clear(assessmentId: string) {
    window.localStorage.removeItem(storageKey(assessmentId));
  }
}

function storageKey(assessmentId: string) {
  return `${STORAGE_PREFIX}${assessmentId}`;
}

function read(assessmentId: string): SampleSizeScenario[] {
  const raw = window.localStorage.getItem(storageKey(assessmentId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SampleSizeScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(assessmentId: string, scenarios: SampleSizeScenario[]) {
  window.localStorage.setItem(storageKey(assessmentId), JSON.stringify(scenarios));
}
