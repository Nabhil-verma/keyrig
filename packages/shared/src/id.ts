/**
 * A random id. crypto.randomUUID is missing in a few browsers, so the fallback
 * keeps the app working. The prefix marks the kind of record in a stored log.
 */
export function createId(fallbackPrefix = "id_"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${fallbackPrefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
