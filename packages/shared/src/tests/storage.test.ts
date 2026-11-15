import { describe, expect, it } from "vitest";
import { createFullStorage, createMemoryStorage, readStoredDocument, writeStoredDocument } from "../storage";

describe("AR-03 stored document reads", () => {
  it("writes a versioned document and reads it back", () => {
    const storage = createMemoryStorage();
    writeStoredDocument(storage, "keyrig.test.v1", 2, { label: "work" });
    const value = readStoredDocument(storage, "keyrig.test.v1", 2, (data) => data as { label: string });
    expect(value).toEqual({ label: "work" });
  });

  it("returns null for a missing record or a different version", () => {
    const storage = createMemoryStorage();
    expect(readStoredDocument(storage, "keyrig.test.v1", 1, (data) => data)).toBeNull();
    storage.setItem("keyrig.test.v1", JSON.stringify({ schemaVersion: 2, appliedMigrations: [], data: {} }));
    expect(readStoredDocument(storage, "keyrig.test.v1", 1, (data) => data)).toBeNull();
  });

  it("returns null for bad JSON or a blocked storage", () => {
    const storage = createMemoryStorage({ "keyrig.test.v1": "not json" });
    expect(readStoredDocument(storage, "keyrig.test.v1", 1, (data) => data)).toBeNull();
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readStoredDocument(blocked, "keyrig.test.v1", 1, (data) => data)).toBeNull();
  });

  it("returns null when the parser rejects the data", () => {
    const storage = createMemoryStorage();
    writeStoredDocument(storage, "keyrig.test.v1", 1, { bad: true });
    expect(readStoredDocument(storage, "keyrig.test.v1", 1, () => null)).toBeNull();
  });

  it("passes a storage failure to the caller", () => {
    expect(() => writeStoredDocument(createFullStorage(), "keyrig.test.v1", 1, {})).toThrow();
  });
});
