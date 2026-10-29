import { KeyrigError } from "@keyrig/shared";
import { describe, expect, it, vi } from "vitest";
import anthropicFixture from "./fixtures/anthropic-chat-stream.json";
import ollamaFixture from "./fixtures/ollama-chat-stream.json";
import overflowFixture from "./fixtures/openai-400-overflow.json";
import unauthorizedFixture from "./fixtures/openai-400-unauthorized.json";
import contentFilterFixture from "./fixtures/openai-400-content-filter.json";
import authFixture from "./fixtures/openai-401.json";
import openaiFixture from "./fixtures/openai-chat-stream.json";
import rateLimitFixture from "./fixtures/openai-429-tpm.json";
import { BUILTIN_MANIFESTS } from "../builtins";
import type { ProviderManifest } from "../manifest";
import { runChat } from "../stream";
import type { Fixture } from "./helpers";
import { fetchAlways, fetchFromFixture, slowStreamResponse, sseData } from "./helpers";

const fixture = (value: unknown): Fixture => value as Fixture;

const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai") as ProviderManifest;
const anthropic = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "anthropic") as ProviderManifest;
const ollama = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "ollama") as ProviderManifest;

const KEY = "sk-test-abcdefghijklmnopqrstuvwxyz012345";

async function chat(
  manifest: ProviderManifest,
  fetchImpl: typeof fetch,
  options: { apiKey?: string; baseUrl?: string; signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const config = {
    fetchImpl,
    ...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
  return runChat({
    manifest,
    config,
    request: {
      model: manifest.defaultModel || "local-model",
      messages: [{ role: "user", content: "Hello" }],
    },
  });
}

describe("PV-08 recorded streams", () => {
  it("reads an OpenAI stream and normalizes the usage counts", async () => {
    const deltas: string[] = [];
    const result = await runChat({
      manifest: openai,
      config: { apiKey: KEY, fetchImpl: fetchFromFixture(fixture(openaiFixture)) },
      request: { model: "gpt-5.4", messages: [{ role: "user", content: "Hello" }] },
      handlers: { onDelta: (text) => deltas.push(text) },
    });

    expect(deltas.join("")).toBe("Hello from keyrig.");
    expect(result.text).toBe("Hello from keyrig.");
    expect(result.finishReason).toBe("stop");
    expect(result.stopReason).toBe("complete");
    expect(result.partial).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 600, outputTokens: 12, cachedTokens: 400 });
    expect(result.requestId).toBe("chatcmpl-test-1");
    expect(result.providerId).toBe("openai");
  });

  it("reads an Anthropic stream with cache usage", async () => {
    const result = await runChat({
      manifest: anthropic,
      config: { apiKey: "sk-ant-test", fetchImpl: fetchFromFixture(fixture(anthropicFixture)) },
      request: { model: "claude-sonnet-4-5", messages: [{ role: "user", content: "Hello" }] },
    });
    expect(result.text).toBe("Hello from Anthropic.");
    expect(result.finishReason).toBe("end_turn");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 42, cachedTokens: 800 });
    expect(result.stopReason).toBe("complete");
    expect(result.requestId).toBe("msg_test_1");
  });

  it("reads an Ollama NDJSON stream", async () => {
    const result = await runChat({
      manifest: ollama,
      config: { fetchImpl: fetchFromFixture(fixture(ollamaFixture)) },
      request: { model: "llama3.2", messages: [{ role: "user", content: "Hello" }] },
    });
    expect(result.text).toBe("Hello from Ollama.");
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 7 });
    expect(result.finishReason).toBe("stop");
    expect(result.stopReason).toBe("complete");
  });

  it("marks a broken stream as partial and does not retry it", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(sseData({ choices: [{ delta: { content: "Half" } }] }), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    ) as unknown as typeof fetch;
    const result = await chat(openai, fetchImpl, { apiKey: KEY });
    expect(result.text).toBe("Half");
    expect(result.partial).toBe(true);
    expect(result.stopReason).toBe("partial");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the partial text and marks the result aborted when the user stops", async () => {
    const controller = new AbortController();
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const encoder = new TextEncoder();
      const chunks = [
        `data: {"id":"x","choices":[{"delta":{"content":"First"}}]}\n\n`,
        `data: {"id":"x","choices":[{"delta":{"content":"Second"}}]}\n\n`,
      ];
      return new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            let index = 0;
            const tick = (): void => {
              if (init?.signal?.aborted) {
                streamController.error(new DOMException("Aborted", "AbortError"));
                return;
              }
              if (index >= chunks.length) {
                streamController.close();
                return;
              }
              streamController.enqueue(encoder.encode(chunks[index] ?? ""));
              index += 1;
              setTimeout(tick, 25);
            };
            tick();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const result = await runChat({
      manifest: openai,
      config: { apiKey: KEY, fetchImpl, signal: controller.signal },
      request: { model: "gpt-5.4", messages: [{ role: "user", content: "Hello" }] },
      handlers: {
        onDelta: () => controller.abort(),
      },
    });

    expect(result.text).toBe("First");
    expect(result.aborted).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.stopReason).toBe("aborted");
  });

  it("stops with a timeout error and keeps the streamed text out of the error", async () => {
    const fetchImpl = (async () =>
      slowStreamResponse([`data: {"choices":[{"delta":{"content":"Slow"}}]}\n\n`], 60)) as typeof fetch;
    await expect(chat(openai, fetchImpl, { apiKey: KEY, timeoutMs: 10 })).rejects.toMatchObject({
      category: "timeout",
    });
  });
});

describe("KS-06 and ER-05 failures in the call path", () => {
  it("fails with a clear error when the key is missing", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const error = await chat(openai, fetchImpl, {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(KeyrigError);
    expect((error as KeyrigError).category).toBe("auth");
    expect((error as KeyrigError).code).toBe("missing_api_key");
    expect((error as KeyrigError).remediation.action).toBe("check_key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies status 401 as auth and keeps the sent key out of the error", async () => {
    const error = (await chat(openai, fetchFromFixture(fixture(authFixture)), { apiKey: KEY }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("auth");
    expect(error.retryable).toBe(false);
    expect(error.remediation.action).toBe("check_key");
    const json = JSON.stringify(error.toJSON());
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("Incorrect API key");
    expect(error.toJSON().details).toEqual({ status: 401, providerCode: "invalid_api_key" });
  });

  it("does not start the key flow for a 400 that quotes unauthorized", async () => {
    const error = (await chat(openai, fetchFromFixture(fixture(unauthorizedFixture)), { apiKey: KEY }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("invalid_request");
    expect(error.remediation.action).toBe("check_settings");
  });

  it("gives a rate limit a wait action and a visible wait time", async () => {
    const error = (await chat(openai, fetchFromFixture(fixture(rateLimitFixture)), { apiKey: KEY }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("rate_limit");
    expect(error.retryable).toBe(true);
    expect(error.remediation.action).toBe("wait");
    expect(error.toJSON().details).toMatchObject({ retryAfterMs: 2000 });
  });

  it("classifies context overflow and starts the reduce-context fix", async () => {
    const error = (await chat(openai, fetchFromFixture(fixture(overflowFixture)), { apiKey: KEY }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("context_overflow");
    expect(error.remediation.action).toBe("reduce_context");
  });

  it("classifies a content filter and asks for a prompt change", async () => {
    const error = (await chat(openai, fetchFromFixture(fixture(contentFilterFixture)), { apiKey: KEY }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("content_filter");
    expect(error.remediation.action).toBe("change_prompt");
  });

  it("does not put the prompt or a file path in the error text (TS-04)", async () => {
    const body = JSON.stringify({
      error: {
        message: "Bad request in C:\\Users\\nisha\\secret-project\\notes.md for the text: my private prompt",
        code: "invalid_value",
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 400 })) as unknown as typeof fetch;
    const error = (await chat(openai, fetchImpl, { apiKey: KEY }).catch((caught: unknown) => caught)) as KeyrigError;
    const json = JSON.stringify(error.toJSON());
    expect(json).not.toContain("nisha");
    expect(json).not.toContain("private prompt");
    expect(json).not.toContain("notes.md");
  });
});

describe("KS-07 custom base URL", () => {
  it("adds a warning for a local base URL", async () => {
    const lmstudio = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "lmstudio") as ProviderManifest;
    const result = await chat(lmstudio, fetchAlways(fixture(openaiFixture)), {
      baseUrl: "http://127.0.0.1:1234/v1",
    });
    expect(result.warnings?.[0]).toMatch(/private address/);
  });

  it("blocks a metadata address before the request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const error = (await chat(openai, fetchImpl, { apiKey: KEY, baseUrl: "http://169.254.169.254/latest" }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("invalid_request");
    expect(error.code).toBe("blocked_base_url");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("key handling", () => {
  it("sends the key in the header and stores it nowhere else", async () => {
    let seen: HeadersInit | undefined;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen = init?.headers;
      return new Response(openaiFixture.response.chunks?.join("") ?? "", { status: 200 });
    }) as typeof fetch;
    await chat(openai, fetchImpl, { apiKey: KEY });
    expect((seen as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("PV-02 a network failure uses the manifest hint", () => {
  it("shows the hint when the fetch throws before a response", async () => {
    const hinted: ProviderManifest = {
      ...openai,
      id: "hinted",
      networkHint: "This provider does not allow this browser origin.",
    };
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const error = (await chat(hinted, fetchImpl, { apiKey: KEY }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error).toBeInstanceOf(KeyrigError);
    expect(error.category).toBe("network");
    expect(error.code).toBe("network_failed");
    expect(error.message).toBe("This provider does not allow this browser origin.");
    expect(error.message).not.toContain(KEY);
  });

  it("keeps the default network message when the manifest has no hint", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const error = (await chat(openai, fetchImpl, { apiKey: KEY }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error.category).toBe("network");
    expect(error.message).toMatch(/cannot reach the provider/);
  });
});
