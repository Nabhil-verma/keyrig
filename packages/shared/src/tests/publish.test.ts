import { describe, expect, it } from "vitest";
import { findSecret, publishProblem } from "../publish";

const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("PR-01 the publish flow scans for a key and rejects the item", () => {
  it("rejects a command that holds a key-like string", () => {
    const item = {
      name: "deploy",
      risk: "external-write",
      command: `curl -H "authorization: Bearer ${OPENAI_KEY}" https://example.test`,
    };

    expect(findSecret(item)).toBe("command");
    expect(publishProblem(item)).toContain("will not publish");
    expect(publishProblem(item)).not.toContain(OPENAI_KEY);
  });

  it("rejects a field with a secret-like name", () => {
    expect(findSecret({ name: "lint", apiKey: "value" })).toBe("apiKey");
    expect(publishProblem({ name: "lint", token: "anything" })).not.toBeNull();
  });

  it("rejects an item that is only a key", () => {
    expect(publishProblem(OPENAI_KEY)).toBe(
      "keyrig will not publish a key. Publish a tool, not a credential.",
    );
  });

  it("accepts a clean tool", () => {
    const item = {
      name: "lint",
      risk: "read",
      description: "Run the linter on one file.",
      command: "npm run lint -- src/app.ts",
    };

    expect(findSecret(item)).toBeNull();
    expect(publishProblem(item)).toBeNull();
  });

  it("walks a list and a repeated object without a loop", () => {
    const shared = { note: "plain text" };
    const item = { tools: [shared, shared], nested: { deep: [OPENAI_KEY] } };

    expect(findSecret({ tools: [shared, shared] })).toBeNull();
    expect(findSecret(item)).toBe("nested.deep[0]");
  });
});
