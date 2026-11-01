import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * Remember the route for each account.
 *
 * The route is the provider, the model, the key and the base URL. The app
 * reads it after sign-in, so a new chat opens ready. The record stays in this
 * browser. It holds no key material, only the id of a key in the vault.
 */
export const ROUTE_STORAGE_KEY = "keyrig.route.v1";
export const ROUTE_SCHEMA_VERSION = 1;

export interface SavedRoute {
  providerId: string;
  modelId: string;
  keyId: string;
  baseUrl: string;
}

type RouteMap = Record<string, SavedRoute>;

function isSavedRoute(value: unknown): value is SavedRoute {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.providerId === "string" &&
    typeof record.modelId === "string" &&
    typeof record.keyId === "string" &&
    typeof record.baseUrl === "string"
  );
}

function readMap(storage: StorageLike): RouteMap {
  let raw: string | null;
  try {
    raw = storage.getItem(ROUTE_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== ROUTE_SCHEMA_VERSION) {
      return {};
    }
    if (parsed.data === null || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
      return {};
    }
    const map: RouteMap = {};
    for (const [username, route] of Object.entries(parsed.data as Record<string, unknown>)) {
      if (isSavedRoute(route)) {
        map[username] = route;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function writeMap(storage: StorageLike, map: RouteMap): void {
  try {
    storage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(createDocument(ROUTE_SCHEMA_VERSION, map)));
  } catch {
    // The route is a convenience. A full or blocked storage must not stop a chat.
  }
}

/** The saved route for one account, or null when the account has no record. */
export function readRoute(storage: StorageLike, username: string): SavedRoute | null {
  return readMap(storage)[username] ?? null;
}

export function writeRoute(storage: StorageLike, username: string, route: SavedRoute): void {
  const map = readMap(storage);
  map[username] = route;
  writeMap(storage, map);
}

export function clearRoute(storage: StorageLike, username: string): void {
  const map = readMap(storage);
  if (!(username in map)) {
    return;
  }
  delete map[username];
  writeMap(storage, map);
}
