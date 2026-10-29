import { describe, expect, it } from "vitest";
import { BUILTIN_MANIFESTS } from "../builtins";
import type { ProviderManifest } from "../manifest";
import { planRequest, type RequestRule } from "../rules";

const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai") as ProviderManifest;
const anthropic = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "anthropic") as ProviderManifest;
const ollama = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "ollama") as ProviderManifest;

const intent = {
  kind: "chat" as const,
  stream: true,
  messages: [
    { role: "system" as const, content: "You are keyrig." },
    { role: "user" as const, content: "Hello" },
  ],
  maxTokens: 128,
  temperature: 0.2,
};

describe("PV-03 intent -> named rule -> wire format", () => {
  it("builds the OpenAI plan with a named rule", () => {
    const plan = planRequest({ manifest: openai, baseUrl: openai.baseUrl, apiKey: "sk-test", model: "gpt-5.4", intent });
    expect(plan.ruleId).toBe("openai-chat");
    expect(plan.wireFormat).toBe("openai-chat");
    expect(plan.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(plan.headers.authorization).toBe("Bearer sk-test");
    expect(plan.body).toMatchObject({
      model: "gpt-5.4",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 128,
      temperature: 0.2,
    });
  });

  it("uses max_tokens for a compatible server", () => {
    const compatible = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai-compatible") as ProviderManifest;
    const plan = planRequest({
      manifest: compatible,
      baseUrl: compatible.baseUrl,
      model: "local-model",
      intent,
    });
    expect(plan.body.max_tokens).toBe(128);
    expect(plan.body).not.toHaveProperty("max_completion_tokens");
    expect(plan.headers.authorization).toBeUndefined();
  });

  it("moves the system message out of the Anthropic message list", () => {
    const plan = planRequest({
      manifest: anthropic,
      baseUrl: anthropic.baseUrl,
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-5",
      intent,
    });
    expect(plan.ruleId).toBe("anthropic-messages");
    expect(plan.url).toBe("https://api.anthropic.com/v1/messages");
    expect(plan.body.system).toBe("You are keyrig.");
    expect(plan.body.max_tokens).toBe(128);
    expect(plan.headers["x-api-key"]).toBe("sk-ant-test");
    expect(plan.headers["anthropic-version"]).toBe("2023-06-01");
    const messages = plan.body.messages as Array<{ role: string }>;
    expect(messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("uses 4096 output tokens for Anthropic when the intent has no limit", () => {
    const { maxTokens: _omitted, ...withoutLimit } = intent;
    const plan = planRequest({
      manifest: anthropic,
      baseUrl: anthropic.baseUrl,
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-5",
      intent: withoutLimit,
    });
    expect(plan.body.max_tokens).toBe(4096);
  });

  it("marks a cached Anthropic system prompt", () => {
    const plan = planRequest({
      manifest: anthropic,
      baseUrl: anthropic.baseUrl,
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-5",
      intent: { ...intent, promptCache: true },
    });
    expect(plan.body.system).toEqual([
      { type: "text", text: "You are keyrig.", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("builds the Ollama plan with options and no auth header", () => {
    const plan = planRequest({ manifest: ollama, baseUrl: ollama.baseUrl, model: "llama3.2", intent });
    expect(plan.ruleId).toBe("ollama-chat");
    expect(plan.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(plan.headers.authorization).toBeUndefined();
    expect(plan.body.options).toEqual({ num_predict: 128, temperature: 0.2 });
  });

  it("fails with a clear error when no rule exists for a wire format", () => {
    const fake = { ...openai, wireFormat: "not-a-format" as ProviderManifest["wireFormat"] };
    expect(() =>
      planRequest({ manifest: fake, baseUrl: "https://example.com", model: "x", intent }),
    ).toThrowError(/no request rule/);
  });

  it("adds a provider with one rule and no core change", () => {
    const fake = { ...openai, id: "fake", wireFormat: "fake-wire" as ProviderManifest["wireFormat"] };
    const fakeRule: RequestRule = {
      id: "fake-rule",
      wireFormat: "fake-wire" as ProviderManifest["wireFormat"],
      build: (context) => ({
        ruleId: "fake-rule",
        wireFormat: context.manifest.wireFormat,
        url: `${context.baseUrl}/fake`,
        headers: {},
        body: { model: context.model, prompt: "x" },
      }),
    };
    const plan = planRequest({ manifest: fake, baseUrl: "https://example.com", model: "m", intent }, [fakeRule]);
    expect(plan.url).toBe("https://example.com/fake");
    expect(plan.body.prompt).toBe("x");
  });
});

describe("PV-07 image normalization", () => {
  const image = { type: "image" as const, mediaType: "image/png", data: "AAAA" };
  const withImage = {
    kind: "chat" as const,
    stream: true,
    messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Look" }, image] }],
  };

  it("converts an image for OpenAI", () => {
    const plan = planRequest({ manifest: openai, baseUrl: openai.baseUrl, apiKey: "k", model: "gpt-5.4", intent: withImage });
    const messages = plan.body.messages as Array<{ content: unknown }>;
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Look" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("converts an image for Anthropic", () => {
    const plan = planRequest({ manifest: anthropic, baseUrl: anthropic.baseUrl, apiKey: "k", model: "claude-sonnet-4-5", intent: withImage });
    const messages = plan.body.messages as Array<{ content: unknown }>;
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Look" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
    ]);
  });

  it("converts an image for Ollama", () => {
    const plan = planRequest({ manifest: ollama, baseUrl: ollama.baseUrl, model: "llama3.2", intent: withImage });
    const messages = plan.body.messages as Array<{ images?: unknown }>;
    expect(messages[0]?.images).toEqual(["AAAA"]);
  });
});
