import type { KeyrigErrorJSON } from "@keyrig/shared";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  model?: string;
  providerId?: string;
  keyLabel?: string;
  costUsd?: number;
  pricingKnown?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheState?: "hit" | "none";
  stopReason?: string;
  error?: KeyrigErrorJSON;
}

export interface ArenaResult {
  model: string;
  text: string;
  durationMs: number;
  costUsd: number;
  pricingKnown: boolean;
  inputTokens: number;
  outputTokens: number;
  error?: KeyrigErrorJSON;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
