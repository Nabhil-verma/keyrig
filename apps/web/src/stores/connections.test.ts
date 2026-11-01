import { createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { normalizeConnections, readConnections, writeConnections } from "./connections";

describe("the profile connections", () => {
  it("keeps a Gmail address and drops another domain", () => {
    expect(normalizeConnections({ recoveryEmail: "Person@Gmail.com" }).recoveryEmail).toBe("person@gmail.com");
    expect(normalizeConnections({ recoveryEmail: "person@yahoo.com" }).recoveryEmail).toBeNull();
  });

  it("needs a login and a repository before a commit is allowed", () => {
    expect(normalizeConnections({ commitPermit: true }).commitPermit).toBe(false);
    expect(normalizeConnections({ commitPermit: true, githubLogin: "alice" }).commitPermit).toBe(false);
    expect(
      normalizeConnections({ commitPermit: true, githubLogin: "alice", githubRepo: "alice/site" }).commitPermit,
    ).toBe(true);
  });

  it("drops the permit when the account is removed", () => {
    const store = createMemoryStorage();
    writeConnections(store, { githubLogin: "alice", githubRepo: "alice/site", commitPermit: true });
    expect(readConnections(store).commitPermit).toBe(true);
    writeConnections(store, { githubLogin: null });
    expect(readConnections(store).commitPermit).toBe(false);
  });

  it("uses the main branch when the record has none", () => {
    expect(normalizeConnections({}).githubBranch).toBe("main");
  });

  it("reads an empty record as the defaults", () => {
    expect(readConnections(createMemoryStorage())).toEqual(normalizeConnections({}));
  });
});
