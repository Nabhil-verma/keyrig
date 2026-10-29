import type { Usage } from "./types";

/** USD for one million tokens. The catalog uses the same unit. */
export interface PriceTier {
  /** The tier applies when inputTokens is larger than this number. */
  minInputTokens: number;
  input: number;
  output: number;
  cacheRead?: number;
}

export interface Pricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  tiers?: readonly PriceTier[];
}

export interface CostEstimate {
  usd: number;
  /** True when a price was available. The UI must mark an unknown price. */
  pricingKnown: boolean;
  /** CO-01: the app always marks a cost as estimated. */
  estimated: true;
  breakdown: { inputUsd: number; cachedUsd: number; outputUsd: number };
}

const MILLION = 1_000_000;

export function selectPrice(pricing: Pricing, inputTokens: number): Omit<PriceTier, "minInputTokens"> {
  const tiers = [...(pricing.tiers ?? [])].sort((a, b) => a.minInputTokens - b.minInputTokens);
  let chosen: Omit<PriceTier, "minInputTokens"> = {
    input: pricing.input,
    output: pricing.output,
    ...(pricing.cacheRead !== undefined ? { cacheRead: pricing.cacheRead } : {}),
  };
  for (const tier of tiers) {
    if (inputTokens > tier.minInputTokens) {
      chosen = {
        input: tier.input,
        output: tier.output,
        ...(tier.cacheRead !== undefined ? { cacheRead: tier.cacheRead } : {}),
      };
    }
  }
  return chosen;
}

export function estimateCost(usage: Usage, pricing: Pricing | undefined): CostEstimate {
  if (!pricing) {
    return {
      usd: 0,
      pricingKnown: false,
      estimated: true,
      breakdown: { inputUsd: 0, cachedUsd: 0, outputUsd: 0 },
    };
  }

  const price = selectPrice(pricing, usage.inputTokens);
  const cached = usage.cachedTokens ?? 0;
  const inputUsd = (usage.inputTokens / MILLION) * price.input;
  const cachedUsd = (cached / MILLION) * (price.cacheRead ?? price.input);
  const outputUsd = (usage.outputTokens / MILLION) * price.output;

  return {
    usd: inputUsd + cachedUsd + outputUsd,
    pricingKnown: true,
    estimated: true,
    breakdown: { inputUsd, cachedUsd, outputUsd },
  };
}

/** A short USD text for the UI. A small cost keeps four decimals. */
export function formatUsd(usd: number, pricingKnown = true): string {
  if (!pricingKnown) {
    return "cost unknown";
  }
  if (usd === 0) {
    return "$0.00";
  }
  if (usd < 0.01) {
    return `$${usd.toFixed(5)}`;
  }
  return `$${usd.toFixed(2)}`;
}
