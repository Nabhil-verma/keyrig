import { describe, expect, it } from "vitest";
import {
  DEFAULT_COPY,
  ERROR_CATEGORIES,
  KeyrigError,
  REMEDIATION_ACTIONS,
  describeError,
  toKeyrigError,
} from "../errors";
import { maskSecret, redact, redactDeep } from "../redact";

const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const ANTHROPIC_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345";
const GITHUB_KEY = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";

describe("ER-02 error contract", () => {
  it("has one shape with a code, a category, a message, retryable, an action and details", () => {
    const error = KeyrigError.fromCategory("rate_limit", { details: { retryAfterMs: 2000 } });
    expect(error.toJSON()).toEqual({
      code: "provider_rate_limited",
      category: "rate_limit",
      message: "The provider is busy. Wait, then try again.",
      retryable: true,
      remediation: { action: "wait" },
      details: { retryAfterMs: 2000 },
    });
  });

  it("gives every category a default copy with an action in the fixed list", () => {
    for (const category of ERROR_CATEGORIES) {
      const copy = DEFAULT_COPY[category];
      expect(copy.code.length).toBeGreaterThan(0);
      expect(REMEDIATION_ACTIONS).toContain(copy.action);
    }
  });

  it("keeps a new detail without the cause or the headers", () => {
    const error = KeyrigError.fromCategory("server", {
      cause: new Error("Authorization: Bearer sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"),
    });
    const json = error.withDetails({ attempt: 2 }).toJSON();
    expect(json.details).toEqual({ attempt: 2 });
    expect(JSON.stringify(json)).not.toContain("sk-proj-");
  });
});

describe("ER-03 no key in the error path", () => {
  it("masks a key in the message and in every detail value", () => {
    const error = new KeyrigError({
      code: "invalid_request",
      category: "invalid_request",
      message: `The provider rejected ${OPENAI_KEY}.`,
      retryable: false,
      action: "check_settings",
      details: { sent: OPENAI_KEY, nested: { list: [ANTHROPIC_KEY] } },
    });
    const text = JSON.stringify(error.toJSON());
    expect(text).not.toContain(OPENAI_KEY);
    expect(text).not.toContain(ANTHROPIC_KEY);
    expect(text).toContain("[redacted]");
  });

  it("masks a registered secret that has no known pattern", () => {
    const secret = "local-ollama-token-9f8e7d6c";
    const error = new KeyrigError({
      code: "invalid_request",
      category: "invalid_request",
      message: `Rejected ${secret}`,
      retryable: false,
      action: "check_settings",
      secrets: [secret],
    });
    expect(error.toJSON().message).not.toContain(secret);
  });

  it("describes an error in one safe line", () => {
    const error = toKeyrigError(new Error(`boom ${GITHUB_KEY}`));
    expect(describeError(error)).toBe("server/provider_error: The provider failed. Try again in a moment.");
  });

  it("maps an abort to the cancelled category", () => {
    const error = toKeyrigError(new DOMException("stop", "AbortError"));
    expect(error.category).toBe("cancelled");
    expect(error.retryable).toBe(false);
  });
});

describe("KS-03 one redaction function", () => {
  it.each([
    ["openai key", OPENAI_KEY],
    ["anthropic key", ANTHROPIC_KEY],
    ["github token", GITHUB_KEY],
  ])("masks an %s in free text", (_name, secret) => {
    const text = `request failed for ${secret} at 12:00`;
    const output = redact(text);
    expect(output).not.toContain(secret);
    expect(output).toContain("[redacted]");
    expect(output).toContain("request failed for");
  });

  it("masks a bearer token and a query string key", () => {
    const output = redact(
      "Authorization: Bearer abc.def.ghi123456789 and ?api_key=sk-live-0123456789abcdef&model=x",
    );
    expect(output).not.toContain("abc.def.ghi123456789");
    expect(output).not.toContain("sk-live-0123456789abcdef");
    expect(output).toContain("model=x");
  });

  it("masks a key in each sink representation (log, error, export, telemetry, tool result, transcript)", () => {
    const sinks: Record<string, unknown> = {
      log: `level=error key=${OPENAI_KEY}`,
      error: new KeyrigError({
        code: "provider_error",
        category: "server",
        message: OPENAI_KEY,
        retryable: true,
        action: "retry",
      }).toJSON(),
      export: { version: 1, chats: [{ messages: [{ role: "user", content: `use ${OPENAI_KEY}` }] }] },
      telemetry: { event: "request.failed", apiKey: OPENAI_KEY },
      toolResult: { content: [{ type: "text", text: ANTHROPIC_KEY }] },
      transcript: { messages: [{ role: "assistant", content: `I saw ${GITHUB_KEY}` }] },
    };

    for (const [name, value] of Object.entries(sinks)) {
      const safe = typeof value === "string" ? redact(value) : redactDeep(value);
      const text = JSON.stringify(safe);
      expect(text, name).not.toContain(OPENAI_KEY);
      expect(text, name).not.toContain(ANTHROPIC_KEY);
      expect(text, name).not.toContain(GITHUB_KEY);
    }
  });

  it("survives a circular object", () => {
    const value: Record<string, unknown> = { key: OPENAI_KEY };
    value.self = value;
    const safe = redactDeep(value);
    expect(JSON.stringify(safe)).toContain("[circular]");
    expect(JSON.stringify(safe)).not.toContain(OPENAI_KEY);
  });

  it("does not change normal text", () => {
    expect(redact("The model answered in 2.4 seconds.")).toBe("The model answered in 2.4 seconds.");
  });
});

describe("KS-04 safe key display", () => {
  it("shows only the last four characters", () => {
    const shown = maskSecret(OPENAI_KEY);
    expect(shown).toBe("\u2026" + OPENAI_KEY.slice(-4));
    expect(shown).not.toContain(OPENAI_KEY.slice(0, 10));
  });

  it("shows an empty string for an empty key", () => {
    expect(maskSecret("")).toBe("");
  });
});
