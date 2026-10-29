import { describe, expect, it } from "vitest";
import { classifyStatus, providerHttpError, providerStreamError } from "../classify";

describe("KS-06 auth failures use the HTTP status only", () => {
  it("treats status 401 as auth", () => {
    expect(classifyStatus(401, "The model is overloaded.")).toBe("auth");
  });

  it("treats status 403 as auth", () => {
    expect(classifyStatus(403, "")).toBe("auth");
  });

  it("does not treat a 400 that quotes the word unauthorized as auth", () => {
    expect(classifyStatus(400, "The document text said unauthorized.")).toBe("invalid_request");
  });

  it("does not treat a 429 that quotes the word forbidden as auth", () => {
    expect(classifyStatus(429, "The request is forbidden by the rate limit.")).toBe("rate_limit");
  });
});

describe("ER-04 context overflow", () => {
  it("detects an overflow from status 400 and a context message", () => {
    expect(classifyStatus(400, "This model's maximum context length is 8192 tokens.")).toBe("context_overflow");
  });

  it("detects an overflow from status 413", () => {
    expect(classifyStatus(413, "Requested input length exceeds the maximum.")).toBe("context_overflow");
  });

  it("does not treat a token-per-minute limit as an overflow", () => {
    expect(classifyStatus(400, "Rate limit reached. Your tokens exceed the tokens per minute limit.")).toBe(
      "rate_limit",
    );
  });

  it("does not treat status 429 with a token message as an overflow", () => {
    expect(classifyStatus(429, "Too many tokens. Try again in 20 seconds.")).toBe("rate_limit");
  });

  it("treats a plain 400 as an invalid request", () => {
    expect(classifyStatus(400, "The model field is required.")).toBe("invalid_request");
  });
});

describe("other categories", () => {
  it.each([
    [402, "", "quota"],
    [408, "", "timeout"],
    [500, "", "server"],
    [503, "The server is overloaded.", "server"],
    [404, "The model does not exist.", "invalid_request"],
    [400, "The response was blocked by the content filter.", "content_filter"],
    [429, "You exceeded your current quota. Check your billing.", "quota"],
  ] as const)("maps each status and text to the expected category", (status, text, category) => {
    expect(classifyStatus(status, text)).toBe(category);
  });

  it("returns a retryable rate limit with the wait time", () => {
    const response = new Response("{}", { status: 429, headers: { "retry-after": "2" } });
    const error = providerHttpError(429, "rate limit", { response });
    expect(error.category).toBe("rate_limit");
    expect(error.retryable).toBe(true);
    expect(error.toJSON().details).toEqual({ status: 429, retryAfterMs: 2000 });
  });

  it("keeps a short provider code and drops the body text", () => {
    const error = providerHttpError(401, JSON.stringify({ error: { code: "invalid_api_key", message: "x" } }));
    expect(error.toJSON().details).toEqual({ status: 401, providerCode: "invalid_api_key" });
    expect(JSON.stringify(error.toJSON())).not.toContain("x");
  });

  it("classifies a content filter inside a stream", () => {
    expect(providerStreamError("blocked by the content filter").category).toBe("content_filter");
  });

  it("classifies a stream error with no signal as a server error", () => {
    expect(providerStreamError("upstream connection reset").category).toBe("server");
  });
});
