import { KeyrigError, createId } from "@keyrig/shared";
import {
  estimateCost,
  runChat,
  type ChatMessage,
  type ChatResult,
  type CostEstimate,
  type Pricing,
  type ProviderManifest,
  type StreamHandlers,
  type ToolSpec,
} from "@keyrig/providers";
import { withSystemPrompt } from "../agent/prompts";
import type { KeyView, KeyVault } from "../keys/vault";
import type { UsageBus, UsageEvent } from "./usage";

/**
 * One chat turn through the core.
 * - PV-09: retry an empty reply one time, and never after a tool ran.
 * - CO-01 and CO-04: attach the estimated cost and emit one usage event.
 * - PR-02: return the key label with the result.
 */
export interface SendChatOptions {
  vault: KeyVault;
  /** Absent for a provider that needs no key, such as the hosted model. */
  keyId?: string;
  manifest: ProviderManifest;
  model: string;
  messages: readonly ChatMessage[];
  /** AS-06: the guard prompt. The core puts it first in the message list. */
  systemPrompt?: string;
  /** AS-01: the tools that the model can ask for. */
  tools?: readonly ToolSpec[];
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

function isEmptyReply(result: ChatResult): boolean {
  return result.text.trim().length === 0 && !result.aborted && result.stopReason === "complete";
}

export async function sendChat(options: SendChatOptions): Promise<ChatOutcome> {
  const { vault, manifest, model } = options;
  const keyId = options.keyId ?? "";

  const keyNotFound = (): KeyrigError =>
    KeyrigError.fromCategory("auth", {
      code: "key_not_found",
      message: "keyrig cannot find this key. Add the key again.",
    });

  const readKey = (): { key: KeyView | null; secret: string } => {
    if (keyId.length === 0) {
      if (manifest.authType === "api-key") {
        throw KeyrigError.fromCategory("auth", {
          code: "key_required",
          message: "This provider needs a key. Add one first.",
          action: "check_key",
        });
      }
      return { key: null, secret: "" };
    }
    const key = vault.getKeyView(keyId) ?? null;
    const secret = key ? (vault.getSecret(keyId) ?? "") : "";
    if (!key || secret.length === 0) {
      throw keyNotFound();
    }
    if (key.providerId !== manifest.id) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "key_provider_mismatch",
        message: "The key belongs to another provider. Choose a key for this provider.",
        action: "check_key",
      });
    }
    return { key, secret };
  };

  const { key, secret } = readKey();

  // AS-06: the guard prompt goes first, so text inside the turn cannot replace it.
  const messages =
    options.systemPrompt === undefined
      ? options.messages
      : withSystemPrompt(options.messages, options.systemPrompt);

  const runOnce = async (): Promise<ChatResult> => {
    const result = await runChat({
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
        ...(options.tools !== undefined ? { tools: options.tools } : {}),
      },
      ...(options.handlers !== undefined ? { handlers: options.handlers } : {}),
    });
    if (result.stopReason === "filtered") {
      throw KeyrigError.fromCategory("content_filter");
    }
    return result;
  };

  let result = await runOnce();
  if (isEmptyReply(result) && options.toolRan !== true) {
    result = await runOnce();
    if (isEmptyReply(result)) {
      throw KeyrigError.fromCategory("empty_reply", {
        code: "empty_reply_twice",
        message: "The model sent an empty answer twice. Try another model.",
        retryable: false,
        action: "switch_model",
      });
    }
  }

  const cost = estimateCost(result.usage, options.pricing);
  const usedAt = options.now?.() ?? Date.now();
  const at = new Date(usedAt).toISOString();
  if (keyId.length > 0) {
    await vault.markUsed(keyId, usedAt);
  }

  const usageEvent: UsageEvent = {
    id: createId("usage_"),
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
