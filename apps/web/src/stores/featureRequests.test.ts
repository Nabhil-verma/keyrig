import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import {
  addLocalRequest,
  readLocalRequests,
  setLocalRequestStatus,
  voteLocalRequest,
} from "./featureRequests";

describe("D-07 a feature request works without a backend", () => {
  it("saves a request and reads it back", () => {
    const storage = createMemoryStorage();
    addLocalRequest(storage, "Add a cost export", "A CSV of the week.", new Date("2026-11-04T10:00:00Z"));

    const requests = readLocalRequests(storage);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.title).toBe("Add a cost export");
    expect(requests[0]?.status).toBe("open");
  });

  it("counts one vote for each request and takes it back", () => {
    const storage = createMemoryStorage();
    const id = addLocalRequest(storage, "Add a cost export", "")[0]!.id;

    expect(voteLocalRequest(storage, id)[0]?.votes).toBe(1);
    expect(voteLocalRequest(storage, id)[0]?.votes).toBe(0);
  });

  it("keeps a status and its reason", () => {
    const storage = createMemoryStorage();
    const id = addLocalRequest(storage, "Add a cost export", "")[0]!.id;

    setLocalRequestStatus(storage, id, "planned", "Next release.");
    const request = readLocalRequests(storage)[0];
    expect(request?.status).toBe("planned");
    expect(request?.statusReason).toBe("Next release.");
  });
});

describe("PR-04 a short title is refused with a clear reason", () => {
  it("refuses a title of two characters", () => {
    const storage = createMemoryStorage();
    expect(() => addLocalRequest(storage, "hi", "")).toThrow(/at least 3/);
  });
});

describe("PR-05 the local request record holds no private data", () => {
  it("holds no key, chat, cost or streak field", () => {
    const storage = createMemoryStorage();
    addLocalRequest(storage, "Add a cost export", "Only the week total.");
    const raw = storage.getItem("keyrig.feature-requests.v1") ?? "";

    expect(raw).not.toContain("sk-");
    for (const field of ["messages", "content", "costUsd", "inputTokens", "streak"]) {
      expect(JSON.parse(raw)).not.toHaveProperty(field);
    }
  });
});
