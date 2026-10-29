import { createMemoryStorage, type StorageLike } from "@keyrig/shared";

/**
 * localStorage can throw in private mode or when the origin is blocked.
 * The app must start with memory storage in that case, so the key vault
 * reports a clear storage error instead of a white screen.
 */
export function browserStorage(): StorageLike {
  try {
    const probe = "keyrig.storage.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}
