/**
 * PV-11: the names that the model picker shows.
 *
 * The provider list is the source of truth for a provider that lists its
 * models. The catalog adds the names that it knows. The current model stays in
 * the list so that the picker can show it after the list changes.
 */

export const CUSTOM_MODEL_VALUE = "__custom__";

export function modelOptions(
  catalog: readonly string[],
  provider: readonly string[],
  current: string,
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  const add = (raw: string): void => {
    const id = raw.trim();
    if (id.length === 0 || seen.has(id)) {
      return;
    }
    seen.add(id);
    options.push(id);
  };

  add(current);
  for (const id of provider) {
    add(id);
  }
  for (const id of catalog) {
    add(id);
  }
  return options;
}
