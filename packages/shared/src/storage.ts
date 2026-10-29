/**
 * The smallest storage surface that the vault and the catalog need.
 * The web app passes `window.localStorage`. Tests pass memory storage.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
