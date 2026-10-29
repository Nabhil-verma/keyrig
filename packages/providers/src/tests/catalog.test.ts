import { createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it, vi } from "vitest";
import { CATALOG_CACHE_KEY, loadCatalog, parseCatalog } from "../catalog";

const payload = {
  openai: {
    id: "openai",
    name: "OpenAI",
    env: ["OPENAI_API_KEY"],
    models: {
      "gpt-5.4": {
        id: "gpt-5.4",
        name: "GPT-5.4",
        cost: {
          input: 2.5,
          output: 15,
          cache_read: 0.25,
          tiers: [{ input: 5, output: 22.5, cache_read: 0.5, tier: { type: "context", size: 272000 } }],
        },
        limit: { context: 1050000, output: 128000 },
        reasoning: true,
        tool_call: true,
        structured_output: true,
        modalities: { input: ["text", "image"], output: ["text"] },
        release_date: "2026-01-01",
      },
    },
  },
};

describe("PV-01 catalog parsing", () => {
  it("reads model ids, prices, limits and abilities", () => {
    const catalog = parseCatalog(payload, new Date("2026-10-17T00:00:00.000Z"));
    expect(catalog.fetchedAt).toBe("2026-10-17T00:00:00.000Z");
    const model = catalog.providers.openai?.models["gpt-5.4"];
    expect(model?.name).toBe("GPT-5.4");
    expect(model?.contextLimit).toBe(1050000);
    expect(model?.outputLimit).toBe(128000);
    expect(model?.abilities).toEqual({ tools: true, reasoning: true, images: true, structuredOutput: true });
    expect(model?.pricing?.input).toBe(2.5);
    expect(model?.pricing?.tiers?.[0]?.minInputTokens).toBe(272000);
  });

  it("skips a provider entry that is not an object", () => {
    const catalog = parseCatalog({ ok: { name: "Ok", models: {} }, bad: 3 });
    expect(Object.keys(catalog.providers)).toEqual(["ok"]);
  });

  it("throws when the document is not an object", () => {
    expect(() => parseCatalog(null)).toThrow(/not an object/);
  });
});

describe("PV-01 catalog cache and offline start", () => {
  it("uses the network, then a fresh cache without a second request", async () => {
    const storage = createMemoryStorage();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const first = await loadCatalog({ storage, fetchImpl, now: () => 1_000_000 });
    expect(first.source).toBe("network");
    expect(storage.getItem(CATALOG_CACHE_KEY)).toContain('"schemaVersion":1');

    const second = await loadCatalog({ storage, fetchImpl, now: () => 1_000_001 });
    expect(second.source).toBe("cache");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("starts with a stale cache when the network is off", async () => {
    const storage = createMemoryStorage();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    await loadCatalog({ storage, fetchImpl, now: () => 1_000_000 });

    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const result = await loadCatalog({
      storage,
      fetchImpl: offline,
      ttlMs: 1,
      now: () => 2_000_000,
    });
    expect(result.source).toBe("cache");
    expect(result.warning).toMatch(/saved model catalog/);
    expect(result.catalog.providers.openai?.models["gpt-5.4"]).toBeDefined();
  });

  it("starts with the bundled catalog when there is no cache and no network", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const result = await loadCatalog({ storage: createMemoryStorage(), fetchImpl: offline });
    expect(result.source).toBe("bundled");
    expect(result.warning).toMatch(/starter model catalog/);
    expect(result.catalog.providers.openai?.models["gpt-5.4"]?.pricing?.input).toBe(2.5);
  });

  it("starts with the bundled catalog when no fetch exists", async () => {
    const originalFetch = globalThis.fetch;
    // Test only: remove fetch to prove the offline branch.
    (globalThis as unknown as { fetch: typeof fetch | undefined }).fetch = undefined;
    try {
      const result = await loadCatalog({ storage: undefined });
      expect(result.source).toBe("bundled");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats a bad network document as an offline start", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const result = await loadCatalog({ storage: createMemoryStorage(), fetchImpl });
    expect(result.source).toBe("bundled");
  });

  it("treats a non-2xx catalog reply as an offline start", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    const result = await loadCatalog({ storage: createMemoryStorage(), fetchImpl });
    expect(result.source).toBe("bundled");
  });

  it("does not throw when the cache write fails", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("The storage is full.");
      },
      removeItem: () => undefined,
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadCatalog({ storage, fetchImpl });
    expect(result.source).toBe("network");
  });
});
