import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import { ROUTE_STORAGE_KEY, clearRoute, readRoute, writeRoute, type SavedRoute } from "./routeStore";

const ROUTE: SavedRoute = {
  providerId: "openai-compatible",
  modelId: "fake-model",
  keyId: "key-1",
  baseUrl: "http://127.0.0.1:8788/v1",
};

describe("a saved route starts the next chat ready", () => {
  it("reads back the route that it saved", () => {
    const storage = createMemoryStorage();
    writeRoute(storage, "nisha", ROUTE);
    expect(readRoute(storage, "nisha")).toEqual(ROUTE);
  });

  it("keeps one route for each account", () => {
    const storage = createMemoryStorage();
    writeRoute(storage, "nisha", ROUTE);
    writeRoute(storage, "owner", { ...ROUTE, modelId: "gpt-5.4" });
    expect(readRoute(storage, "nisha")?.modelId).toBe("fake-model");
    expect(readRoute(storage, "owner")?.modelId).toBe("gpt-5.4");
  });

  it("returns null when the account has no route", () => {
    const storage = createMemoryStorage();
    expect(readRoute(storage, "new-account")).toBeNull();
  });

  it("ignores a record with an unknown schema version or a broken body", () => {
    const storage = createMemoryStorage();
    storage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, data: { nisha: ROUTE } }));
    expect(readRoute(storage, "nisha")).toBeNull();
    storage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, data: { nisha: { modelId: "x" } } }));
    expect(readRoute(storage, "nisha")).toBeNull();
    storage.setItem(ROUTE_STORAGE_KEY, "not json");
    expect(readRoute(storage, "nisha")).toBeNull();
  });

  it("clears one route and leaves the other route in place", () => {
    const storage = createMemoryStorage();
    writeRoute(storage, "nisha", ROUTE);
    writeRoute(storage, "owner", ROUTE);
    clearRoute(storage, "nisha");
    expect(readRoute(storage, "nisha")).toBeNull();
    expect(readRoute(storage, "owner")).toEqual(ROUTE);
  });

  it("keeps a saved route when the storage refuses a write", () => {
    const storage = createMemoryStorage();
    writeRoute(storage, "nisha", ROUTE);
    const blocked = {
      getItem: (key: string) => storage.getItem(key),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: (key: string) => storage.removeItem(key),
    };
    expect(() => writeRoute(blocked, "nisha", { ...ROUTE, modelId: "other" })).not.toThrow();
    expect(readRoute(storage, "nisha")).toEqual(ROUTE);
  });
});
