import { describe, expect, it } from "vitest";
import { applyMigrations, createDocument, isVersionedDocument } from "../schema";

describe("AR-03 versioned storage", () => {
  it("adds a schema version and the applied list on day one", () => {
    const document = createDocument(1, { label: "work" });
    expect(document).toEqual({ schemaVersion: 1, appliedMigrations: [], data: { label: "work" } });
    expect(isVersionedDocument(document)).toBe(true);
  });

  it("applies one migration and records its id", () => {
    const raw = createDocument(1, { name: "work" });
    const result = applyMigrations(raw, 2, [
      { id: "rename-name-to-label", from: 1, to: 2, migrate: (data) => ({ label: (data as { name: string }).name }) },
    ]);
    expect(result.document.data).toEqual({ label: "work" });
    expect(result.document.schemaVersion).toBe(2);
    expect(result.applied).toEqual(["rename-name-to-label"]);
  });

  it("does not run a migration twice", () => {
    const migration = {
      id: "rename-name-to-label",
      from: 1,
      to: 2,
      migrate: (data: unknown) => ({ label: (data as { name: string }).name }),
    };
    const first = applyMigrations(createDocument(1, { name: "work" }), 2, [migration]);
    const second = applyMigrations(first.document, 2, [migration]);
    expect(second.applied).toEqual([]);
    expect(second.document.data).toEqual({ label: "work" });
  });

  it("rejects data from a newer build", () => {
    expect(() => applyMigrations(createDocument(9, {}), 2, [])).toThrow(/newer than this build/);
  });

  it("rejects data without a version", () => {
    expect(() => applyMigrations({ data: {} }, 1, [])).toThrow(/no schema version/);
  });
});
