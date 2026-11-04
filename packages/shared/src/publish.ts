/**
 * PR-01: the publish flow scans an item for a key and rejects it.
 *
 * This is the first of the two checks. The marketplace scan in
 * `sites-preview/backend.mjs` runs the same check again, because a server
 * cannot trust the browser. This one exists so the person sees the refusal
 * before the item leaves the device.
 *
 * The rule is a rejection, not a mask. A masked item would still publish a
 * fragment of the key, so keyrig refuses the whole item.
 */
import { holdsKey } from "./backend";

/** A field name that holds a credential, so the item is refused. */
const SECRET_NAMES =
  /^(authorization|api[-_]?key|apikey|key|token|access[-_]?token|secret|password|passphrase|x-api-key)$/i;

function scan(value: unknown, path: string, seen: WeakSet<object>): string | null {
  if (typeof value === "string") {
    return holdsKey(value) ? path : null;
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = scan(item, `${path}[${index}]`, seen);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const child = path.length === 0 ? key : `${path}.${key}`;
    if (SECRET_NAMES.test(key)) {
      return child;
    }
    const found = scan(item, child, seen);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The path of the first key-like value or key-like field name, or null. */
export function findSecret(item: unknown): string | null {
  return scan(item, "", new WeakSet<object>());
}

/** The reason to refuse a published item, or null when the item is clean. */
export function publishProblem(item: unknown): string | null {
  const found = findSecret(item);
  if (found === null) {
    return null;
  }
  if (found.length === 0) {
    return "keyrig will not publish a key. Publish a tool, not a credential.";
  }
  return `keyrig will not publish an item that holds a key (${found}).`;
}
