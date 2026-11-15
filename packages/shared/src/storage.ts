import { createDocument, isVersionedDocument } from "./schema";

/**
 * The smallest storage surface that the vault and the catalog need.
 * The web app passes `window.localStorage`. Tests pass memory storage.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Read one versioned document. A missing record, a blocked storage, bad JSON, a
 * different schema version or bad data reads as null.
 */
export function readStoredDocument<T>(
  storage: StorageLike,
  key: string,
  schemaVersion: number,
  parse: (data: unknown) => T | null,
): T | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== schemaVersion) {
      return null;
    }
    return parse(parsed.data);
  } catch {
    return null;
  }
}

/** Write one versioned document. The caller decides what to do when storage fails. */
export function writeStoredDocument<T>(
  storage: StorageLike,
  key: string,
  schemaVersion: number,
  data: T,
): void {
  storage.setItem(key, JSON.stringify(createDocument(schemaVersion, data)));
}

export function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** A storage that fails on write. Use it to test the read-only and quota cases. */
export function createFullStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("The storage is full.", "QuotaExceededError");
    },
    removeItem: () => undefined,
  };
}
