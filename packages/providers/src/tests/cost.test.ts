import { describe, expect, it } from "vitest";
import { estimateCost, formatUsd, selectPrice } from "../catalog/cost";

describe("CO-01 estimated cost", () => {
  it("adds the input, cached and output parts", () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 1_000_000 },
      { input: 3, output: 15, cacheRead: 0.3 },
    );
    expect(cost.usd).toBeCloseTo(3 + 15 + 0.3, 6);
    expect(cost.pricingKnown).toBe(true);
    expect(cost.estimated).toBe(true);
    expect(cost.breakdown.cachedUsd).toBeCloseTo(0.3, 6);
  });

  it("prices a small request", () => {
    const cost = estimateCost({ inputTokens: 1000, outputTokens: 500 }, { input: 2.5, output: 15 });
    expect(cost.usd).toBeCloseTo(0.0025 + 0.0075, 8);
  });

  it("marks a missing price as unknown and does not invent a number", () => {
    const cost = estimateCost({ inputTokens: 10, outputTokens: 10 }, undefined);
    expect(cost.pricingKnown).toBe(false);
    expect(cost.usd).toBe(0);
    expect(formatUsd(cost.usd, cost.pricingKnown)).toBe("cost unknown");
  });

  it("uses the cache read price when the catalog has one", () => {
    const cost = estimateCost({ inputTokens: 0, outputTokens: 0, cachedTokens: 1_000_000 }, {
      input: 3,
      output: 15,
      cacheRead: 0.3,
    });
    expect(cost.usd).toBeCloseTo(0.3, 6);
  });

  it("NEW-02 prices cache-write tokens with the cache-write price", () => {
    const cost = estimateCost(
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      { input: 3, output: 15, cacheWrite: 3.75 },
    );
    expect(cost.usd).toBeCloseTo(3.75, 6);
    expect(cost.breakdown.cacheWriteUsd).toBeCloseTo(3.75, 6);
    expect(cost.breakdown.cachedUsd).toBe(0);
  });

  it("NEW-02 uses the input price for a write when the catalog has no write price", () => {
    const cost = estimateCost(
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      { input: 3, output: 15 },
    );
    expect(cost.usd).toBeCloseTo(3, 6);
    expect(cost.breakdown.cacheWriteUsd).toBeCloseTo(3, 6);
  });

  it("BUG-04 selects the cache-write price of the tier", () => {
    const pricing = {
      input: 3,
      output: 15,
      cacheWrite: 3.75,
      tiers: [{ minInputTokens: 200000, input: 6, output: 22.5, cacheWrite: 7.5 }],
    };
    expect(selectPrice(pricing, 1000).cacheWrite).toBe(3.75);
    expect(selectPrice(pricing, 200001).cacheWrite).toBe(7.5);
  });

  it("BUG-04 counts the cached and written tokens for the tier", () => {
    const pricing = {
      input: 3,
      output: 15,
      tiers: [{ minInputTokens: 200000, input: 6, output: 22.5 }],
    };
    const cost = estimateCost(
      { inputTokens: 150000, outputTokens: 0, cachedTokens: 100000 },
      pricing,
    );
    expect(cost.usd).toBeCloseTo((250000 / 1_000_000) * 6, 6);
  });

  it("NEW-02 keeps the model cache-read price on a tier that has none", () => {
    const pricing = {
      input: 3,
      output: 15,
      cacheRead: 0.3,
      tiers: [{ minInputTokens: 100, input: 6, output: 22.5 }],
    };
    expect(selectPrice(pricing, 200).cacheRead).toBe(0.3);
  });

  it("uses a higher tier above the tier size", () => {
    const pricing = {
      input: 2.5,
      output: 15,
      cacheRead: 0.25,
      tiers: [{ minInputTokens: 272000, input: 5, output: 22.5, cacheRead: 0.5 }],
    };
    expect(selectPrice(pricing, 272000).input).toBe(2.5);
    expect(selectPrice(pricing, 272001).input).toBe(5);
    expect(estimateCost({ inputTokens: 300000, outputTokens: 1000 }, pricing).usd).toBeCloseTo(
      300000 / 1e6 * 5 + 1000 / 1e6 * 22.5,
      6,
    );
  });

  it("formats a small cost with enough precision", () => {
    expect(formatUsd(0.00042)).toBe("$0.00042");
    expect(formatUsd(0.42)).toBe("$0.42");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
