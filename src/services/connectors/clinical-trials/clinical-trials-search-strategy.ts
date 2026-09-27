import type { ClinicalTrialsServerSearchStrategy } from "@/domain/models";

export function buildClinicalTrialsApiParameters(
  strategy: ClinicalTrialsServerSearchStrategy,
): URLSearchParams {
  const parameters = new URLSearchParams();
  const advancedFilters: string[] = [];

  setIfPresent(parameters, "query.cond", strategy.condition);
  setIfPresent(parameters, "query.intr", strategy.intervention);
  setIfPresent(parameters, "query.spons", strategy.sponsor);
  setIfPresent(parameters, "query.locn", strategy.country);
  setIfPresent(parameters, "query.term", strategy.keyword);

  if (strategy.statuses.length > 0) {
    parameters.set("filter.overallStatus", strategy.statuses.join("|"));
  }

  pushAreaGroup(advancedFilters, "Phase", strategy.phases);
  pushAreaGroup(advancedFilters, "StudyType", strategy.studyTypes);
  pushAreaGroup(
    advancedFilters,
    "InterventionType",
    strategy.interventionTypes,
  );
  pushAreaGroup(advancedFilters, "StdAge", strategy.ageGroups);

  if (strategy.sex && strategy.sex !== "ALL") {
    advancedFilters.push(`AREA[Sex]${strategy.sex}`);
  }

  if (strategy.startYear) {
    advancedFilters.push(
      `AREA[StartDate]RANGE[${strategy.startYear}-01-01, MAX]`,
    );
  }

  if (advancedFilters.length > 0) {
    parameters.set("filter.advanced", advancedFilters.join(" AND "));
  }

  return parameters;
}

export function hasServerSearchCriteria(
  strategy: ClinicalTrialsServerSearchStrategy,
) {
  return Array.from(buildClinicalTrialsApiParameters(strategy).keys()).length > 0;
}

function setIfPresent(
  parameters: URLSearchParams,
  name: string,
  value: string,
) {
  const normalized = value.trim();
  if (normalized) {
    parameters.set(name, normalized);
  }
}

function pushAreaGroup(
  filters: string[],
  area: string,
  values: readonly string[],
) {
  if (values.length === 0) {
    return;
  }

  const expressions = values.map((value) => `AREA[${area}]${value}`);
  filters.push(
    expressions.length === 1 ? expressions[0] : `(${expressions.join(" OR ")})`,
  );
}
