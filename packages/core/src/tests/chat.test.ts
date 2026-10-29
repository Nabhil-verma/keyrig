import { createMemoryStorage } from "@keyrig/shared";
import {
  BUILTIN_MANIFESTS,
  type ProviderManifest,
  type Pricing,
} from "@keyrig/providers";
import { describe, expect, it } from "vitest";
import { sendChat } from "../chat";
import { createUsageBus } from "../usage";
import { KeyVault } from "../vault";

const KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const PASSPHRASE = "correct horse battery staple";
const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai") as ProviderManifest;
const pricing: Pricing = { input: 2.5, output: 15, cacheRead: 0.25 };
const REPLAY_SSE = [
  'data: {"id":"chatcmpl-test-1","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-test-1","choices":[{"delta":{"content":" from keyrig."},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-test-1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":12,"prompt_tokens_details":{"cached_tokens":400}}}\n\n',
  "data: [DONE]\n\n",
].join("");

interface Context {
  vault: KeyVault;
  keyId: string;
  bus: ReturnType<typeof createUsageBus>;
}

async function context(): Promise<Context> {
  const vault = new KeyVault({ storage: createMemoryStorage(), iterations: 1000 });
  await vault.create(PASSPHRASE);
  const view = await vault.addKey({ label: "work key", providerId: "openai", secret: KEY });
  return { vault, keyId: view.id, bus: createUsageBus() };
}

function fetchReplay(): typeof fetch {
  return (async () =>
    new Response(REPLAY_SSE, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })) as typeof fetch;
}

function fetchEmpty(): typeof fetch {
  return (async () =>
    new Response('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
      status: 200,
    })) as typeof fetch;
}

describe("chat orchestration", () => {
  it("returns the text, the cost, the key label and one usage event", async () => {
    const { vault, keyId, bus } = await context();
    const events: unknown[] = [];
    bus.subscribe((event) => events.push(event));

    const outcome = await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      pricing,
      bus,
      fetchImpl: fetchReplay(),
    });

    expect(outcome.result.text).toBe("Hello from keyrig.");
    expect(outcome.cost.pricingKnown).toBe(true);
    expect(outcome.cost.usd).toBeCloseTo((600 / 1e6) * 2.5 + (400 / 1e6) * 0.25 + (12 / 1e6) * 15, 8);
    expect(outcome.key.label).toBe("work key");
    expect(outcome.cacheState).toBe("hit");
    expect(outcome.usageEvent.keyLabel).toBe("work key");
    expect(outcome.usageEvent.inputTokens).toBe(600);
    expect(outcome.usageEvent.outputTokens).toBe(12);
    expect(outcome.usageEvent.stopReason).toBe("complete");
    expect(events).toHaveLength(1);
    expect(vault.getKeyView(keyId)?.lastUsedAt).toBeDefined();
  });

  it("does not put a key in the usage event (CO-04 and KS-03)", async () => {
    const { vault, keyId, bus } = await context();
    const outcome = await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      pricing,
      bus,
      fetchImpl: fetchReplay(),
    });
    const text = JSON.stringify(bus.history());
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(PASSPHRASE);
    expect(JSON.stringify(outcome.result)).not.toContain(KEY);
  });

  it("marks an unknown price instead of a number (CO-01)", async () => {
    const { vault, keyId } = await context();
    const outcome = await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl: fetchReplay(),
    });
    expect(outcome.cost.pricingKnown).toBe(false);
    expect(outcome.usageEvent.pricingKnown).toBe(false);
  });
});

describe("PV-09 empty reply", () => {
  it("retries one empty reply and then succeeds", async () => {
    const { vault, keyId, bus } = await context();
    let call = 0;
    const mixed: typeof fetch = async (input, init) => {
      call += 1;
      return call === 1 ? fetchEmpty()(input, init) : fetchReplay()(input, init);
    };
    const outcome = await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      pricing,
      bus,
      fetchImpl: mixed,
    });
    expect(outcome.result.text).toBe("Hello from keyrig.");
    expect(call).toBe(2);
  });

  it("fails with a clear action after a second empty reply", async () => {
    const { vault, keyId } = await context();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
      });
    };
    const error = (await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl,
    }).catch((caught: unknown) => caught)) as { code: string; remediation: { action: string } };
    expect(calls).toBe(2);
    expect(error.code).toBe("empty_reply_twice");
    expect(error.remediation.action).toBe("switch_model");
  });

  it("does not retry a turn that already ran a tool", async () => {
    const { vault, keyId } = await context();
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
      });
    };
    await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl,
      toolRan: true,
    }).catch(() => undefined);
    expect(calls).toBe(1);
  });
});

describe("failures", () => {
  it("asks for a prompt change when the provider filters the answer", async () => {
    const { vault, keyId } = await context();
    const fetchImpl: typeof fetch = async () =>
      new Response('data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
      });
    const error = (await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      fetchImpl,
    }).catch((caught: unknown) => caught)) as { category: string };
    expect(error.category).toBe("content_filter");
  });

  it("refuses a key that belongs to another provider", async () => {
    const { vault, keyId } = await context();
    const anthropic = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "anthropic") as ProviderManifest;
    await expect(
      sendChat({
        vault,
        keyId,
        manifest: anthropic,
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Hello" }],
        fetchImpl: fetchReplay(),
      }),
    ).rejects.toMatchObject({ code: "key_provider_mismatch" });
  });

  it("refuses a missing key id", async () => {
    const { vault } = await context();
    await expect(
      sendChat({
        vault,
        keyId: "missing",
        manifest: openai,
        model: "gpt-5.4",
        messages: [{ role: "user", content: "Hello" }],
        fetchImpl: fetchReplay(),
      }),
    ).rejects.toMatchObject({ code: "key_not_found" });
  });

  it("keeps the partial text when the user stops", async () => {
    const { vault, keyId, bus } = await context();
    const controller = new AbortController();
    const fetchImpl: typeof fetch = async () => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            streamController.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"Part"}}]}\n\n'),
            );
            setTimeout(() => {
              if (controller.signal.aborted) {
                streamController.error(new DOMException("Aborted", "AbortError"));
              } else {
                streamController.close();
              }
            }, 20);
          },
        }),
        { status: 200 },
      );
    };
    const outcome = await sendChat({
      vault,
      keyId,
      manifest: openai,
      model: "gpt-5.4",
      messages: [{ role: "user", content: "Hello" }],
      pricing,
      bus,
      signal: controller.signal,
      fetchImpl,
      handlers: { onDelta: () => controller.abort() },
    });
    expect(outcome.result.text).toBe("Part");
    expect(outcome.result.aborted).toBe(true);
    expect(bus.history()[0]?.stopReason).toBe("aborted");
  });
});
