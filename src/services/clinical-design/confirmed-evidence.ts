import type {
  DesignFieldValue,
  DesignValueChangeKind,
  SourcedDesignField,
} from "@/domain/models";

export function isConfirmedDesignField(field: SourcedDesignField) {
  return field.reviewStatus === "approved" || field.reviewStatus === "edited";
}

export function confirmedDesignValue(
  field: SourcedDesignField,
): DesignFieldValue {
  if (!isConfirmedDesignField(field)) return null;
  return field.reviewedValue !== undefined ? field.reviewedValue : field.value;
}

export function classifyValueChange(
  previous: DesignFieldValue,
  next: DesignFieldValue,
): DesignValueChangeKind {
  if (canonicalValue(previous) === canonicalValue(next)) return "none";
  if (semanticValue(previous) === semanticValue(next)) return "formal";
  return "substantive";
}

export function canonicalValue(value: DesignFieldValue) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("|");
  }
  return String(value).trim().toLowerCase();
}

export function semanticValue(value: DesignFieldValue) {
  return canonicalValue(value)
    .replace(/[^\p{L}\p{N}|]+/gu, " ")
    .replace(/\b(at|the|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
