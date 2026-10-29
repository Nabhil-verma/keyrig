import { KeyrigError } from "@keyrig/shared";
import {
  estimateCost,
  runChat,
  type ChatMessage,
  type ChatResult,
  type CostEstimate,
  type Pricing,
  type ProviderManifest,
  type StreamHandlers,
} from "@keyrig/providers";
import type { KeyView, KeyVault } from "./vault";
import type { UsageBus, UsageEvent } from "./usage";

/**
 * One chat turn through the core. The core owns these rules:
 * - PV-09: retry an empty reply one time. Do not retry a turn that ran a tool.
 * - CO-01: attach the estimated cost to the result.
 * - CO-04: emit one usage event after the call.
 * - PR-02: return the key label with the result.
 */
export interface SendChatOptions {
  vault: KeyVault;
  /** Absent for a provider that needs no key, such as the hosted model. */
  keyId?: string;
  manifest: ProviderManifest;
  model: string;
  messages: readonly ChatMessage[];
  pricing?: Pricing;
  bus?: UsageBus;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
  handlers?: StreamHandlers;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  now?: () => number;
  /** PV-08: a turn that already ran a tool is not safe to retry. */
  toolRan?: boolean;
}

export interface ChatOutcome {
  result: ChatResult;
  cost: CostEstimate;
  /** null when the provider needs no key. */
  key: KeyView | null;
  usageEvent: UsageEvent;
  cacheState: "hit" | "none";
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `usage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isEmptyReply(result: ChatResult): boolean {
  return result.text.trim().length === 0 && !result.aborted && result.stopReason === "complete";
}

export async function sendChat(options: SendChatOptions): Promise<ChatOutcome> {
  const { vault, manifest, model, messages } = options;
  const keyId = options.keyId ?? "";

  let key: KeyView | null = null;
  let secret = "";

  if (keyId.length > 0) {
    key = vault.getKeyView(keyId) ?? null;
    if (!key) {
      throw KeyrigError.fromCategory("auth", {
        code: "key_not_found",
        message: "keyrig cannot find this key. Add the key again.",
      });
    }
    secret = vault.getSecret(keyId) ?? "";
    if (!secret) {
      throw KeyrigError.fromCategory("auth", {
        code: "key_not_found",
        message: "keyrig cannot find this key. Add the key again.",
      });
    }
    if (key.providerId !== manifest.id) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "key_provider_mismatch",
        message: "The key belongs to another provider. Choose a key for this provider.",
        action: "check_key",
      });
    }
  } else if (manifest.authType === "api-key") {
    throw KeyrigError.fromCategory("auth", {
      code: "key_required",
      message: "This provider needs a key. Add one first.",
      action: "check_key",
    });
  }

  const call = async (): Promise<ChatResult> =>
    runChat({
      manifest,
      config: {
        apiKey: secret,
        ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
        ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      },
      request: {
        model,
        messages,
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      },
      ...(options.handlers !== undefined ? { handlers: options.handlers } : {}),
    });

  let result = await call();

  if (result.stopReason === "filtered") {
    throw KeyrigError.fromCategory("content_filter");
  }

  if (isEmptyReply(result) && options.toolRan !== true) {
    result = await call();
    if (isEmptyReply(result)) {
      throw KeyrigError.fromCategory("empty_reply", {
        code: "empty_reply_twice",
        message: "The model sent an empty answer twice. Try another model.",
        retryable: false,
        action: "switch_model",
      });
    }
    if (result.stopReason === "filtered") {
      throw KeyrigError.fromCategory("content_filter");
    }
  }

  const cost = estimateCost(result.usage, options.pricing);
  const at = new Date(options.now?.() ?? Date.now()).toISOString();
  if (keyId.length > 0) {
    await vault.markUsed(keyId, Date.parse(at));
  }

  const usageEvent: UsageEvent = {
    id: newId(),
    at,
    providerId: manifest.id,
    model: result.model,
    keyId,
    keyLabel: key?.label ?? "No key",
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    ...(result.usage.cachedTokens !== undefined ? { cachedTokens: result.usage.cachedTokens } : {}),
    costUsd: cost.usd,
    pricingKnown: cost.pricingKnown,
    stopReason: result.stopReason,
    ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
  };
  options.bus?.emit(usageEvent);

  return {
    result,
    cost,
    key,
    usageEvent,
    cacheState: (result.usage.cachedTokens ?? 0) > 0 ? "hit" : "none",
  };
}
