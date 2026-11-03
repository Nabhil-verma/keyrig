import type { AgentEvent, KeyrigScene } from "@keyrig/core";
import { createId, type KeyrigErrorJSON } from "@keyrig/shared";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  /** The text that goes to the model. It can hold the context blocks of CX-04. */
  content: string;
  /** What the user typed, when content holds extra context. */
  display?: string;
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
  /** MC-03: the tool calls of this answer. */
  tools?: AgentEvent[];
  /** AS-04: the scene that keyrig rendered for this answer. */
  scene?: KeyrigScene;
}

export interface ArenaRun {
  prompt: string;
  at: string;
  results: ArenaResult[];
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
  return createId("id_");
}
