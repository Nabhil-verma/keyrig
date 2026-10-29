import { redactDeep } from "@keyrig/shared";
import type { StopReason } from "@keyrig/providers";

/**
 * CO-04: the core emits one usage event after each model call. The UI and the
 * budget code listen to the event. The event holds no key and no prompt text.
 */
export interface UsageEvent {
  id: string;
  at: string;
  providerId: string;
  model: string;
  keyId: string;
  keyLabel: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  costUsd: number;
  pricingKnown: boolean;
  stopReason: StopReason;
  requestId?: string;
}

export type UsageListener = (event: UsageEvent) => void;

export interface UsageBus {
  emit(event: UsageEvent): void;
  subscribe(listener: UsageListener): () => void;
  history(): readonly UsageEvent[];
  clear(): void;
}

const HISTORY_LIMIT = 500;

export function createUsageBus(limit = HISTORY_LIMIT): UsageBus {
  const listeners = new Set<UsageListener>();
  const events: UsageEvent[] = [];

  return {
    emit(event) {
      const safe = redactDeep(event);
      events.push(safe);
      if (events.length > limit) {
        events.shift();
      }
      for (const listener of listeners) {
        listener(safe);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    history() {
      return events;
    },
    clear() {
      events.length = 0;
    },
  };
}
