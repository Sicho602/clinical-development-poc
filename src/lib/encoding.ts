const MOJIBAKE_PATTERN =
  /Ã.|Â.|�|[ÃÂ][\u0080-\u00FF]|(?:ê|ë|ì|í|ð)[\u0080-\u00FF]/;

export function looksLikeMojibake(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return MOJIBAKE_PATTERN.test(value);
}

export function recordHasMojibake(value: unknown): boolean {
  if (typeof value === "string") return looksLikeMojibake(value);
  if (Array.isArray(value)) return value.some(recordHasMojibake);
  if (value && typeof value === "object") {
    return Object.values(value).some(recordHasMojibake);
  }
  return false;
}
