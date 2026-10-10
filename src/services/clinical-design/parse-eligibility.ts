export interface ParsedEligibilityCriteria {
  inclusion: string[];
  exclusion: string[];
  unmatched: string[];
}

const SECTION_PATTERN =
  /^(inclusion criteria|exclusion criteria)\s*:?\s*$/i;

export function parseEligibilityCriteria(
  raw?: string | null,
): ParsedEligibilityCriteria {
  if (!raw?.trim()) {
    return { inclusion: [], exclusion: [], unmatched: [] };
  }

  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let current: "inclusion" | "exclusion" | "unmatched" = "unmatched";
  const parsed: ParsedEligibilityCriteria = {
    inclusion: [],
    exclusion: [],
    unmatched: [],
  };

  for (const line of lines) {
    const header = line.match(SECTION_PATTERN);
    if (header) {
      current = header[1].toLowerCase().startsWith("inclusion")
        ? "inclusion"
        : "exclusion";
      continue;
    }
    parsed[current].push(normalizeCriterion(line));
  }

  return parsed;
}

function normalizeCriterion(line: string) {
  return line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}
