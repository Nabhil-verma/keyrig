import { describe, expect, it } from "vitest";
import { BACKEND_FIELDS, backendRequest, holdsKey } from "../backend";

const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const ACCOUNT = { username: "alice", role: "owner" };

describe("PR-01 no key reaches the backend", () => {
  it("keeps the four allowed fields and drops every other field", () => {
    const request = backendRequest({
      account: ACCOUNT,
      apiKey: OPENAI_KEY,
      authorization: `Bearer ${OPENAI_KEY}`,
      cookie: "value",
    });

    expect(Object.keys(request)).toEqual(["account"]);
    expect(JSON.stringify(request)).not.toContain(OPENAI_KEY);
    expect(request.account).toEqual(ACCOUNT);
  });

  it("refuses an allowed field that holds a key-like string", () => {
    const request = backendRequest({
      account: ACCOUNT,
      publishedTools: { name: `lint ${OPENAI_KEY}`, risk: "read" },
    });

    expect(request.publishedTools).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain(OPENAI_KEY);
  });

  it("masks a key name inside an allowed field", () => {
    const request = backendRequest({ publishedTools: { name: "lint", token: "abc123xyz" } });

    expect(JSON.stringify(request)).toContain("[redacted]");
    expect(JSON.stringify(request)).not.toContain("abc123xyz");
    expect(request.publishedTools).toEqual({ name: "lint", token: "[redacted]" });
  });

  it("finds a key-like string without a registered secret", () => {
    expect(holdsKey(OPENAI_KEY)).toBe(true);
    expect(holdsKey("The model answered in 2.4 seconds.")).toBe(false);
  });
});

describe("PR-05 the backend gets only data that the user sends on purpose", () => {
  it("leaves chats, prompts, cost, usage and streak data on the device", () => {
    const request = backendRequest({
      account: ACCOUNT,
      votes: { toolId: "lint", up: true },
      messages: [{ role: "user", content: "my private prompt" }],
      chats: [{ title: "my private chat" }],
      prompt: "my private prompt",
      cost: 0.42,
      usage: { inputTokens: 10 },
      streakDays: 12,
      streaks: [{ day: "2026-11-04" }],
    });

    expect(Object.keys(request).sort()).toEqual(["account", "votes"]);
    const text = JSON.stringify(request);
    for (const value of ["private", "0.42", "inputTokens", "streakDays", "2026-11-04"]) {
      expect(text).not.toContain(value);
    }
  });

  it("sends the account, the published tools, the feature requests and the votes", () => {
    const input = {
      account: ACCOUNT,
      publishedTools: { name: "lint", risk: "read" },
      featureRequests: [{ title: "Add a cost export" }],
      votes: [{ toolId: "lint", up: true }],
      unrelated: "drop me",
    };

    expect(backendRequest(input)).toEqual({
      account: input.account,
      publishedTools: input.publishedTools,
      featureRequests: input.featureRequests,
      votes: input.votes,
    });
    expect(BACKEND_FIELDS).toEqual(["account", "publishedTools", "featureRequests", "votes"]);
  });
});
