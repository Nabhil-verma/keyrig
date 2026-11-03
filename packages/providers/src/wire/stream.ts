import { KeyrigError } from "@keyrig/shared";
import { readAnthropicStream } from "../adapters/anthropic";
import { readOllamaStream } from "../adapters/ollama";
import { readOpenAiStream } from "../adapters/openai";
import { classifyThrown } from "./classify";
import { planRequest, type RequestRule } from "../manifests/rules";
import type { ProviderManifest } from "../manifests/manifest";
import { fetchProvider, prepareCall } from "./request";
import type {
  ChatRequest,
  ChatResult,
  ProviderCallConfig,
  StopReason,
  StreamHandlers,
  StreamState,
} from "./types";

/**
 * One chat request, end to end (PV-08).
 *
 * The caller can abort at any time and keeps the text that already arrived.
 * A broken stream is marked "partial" and is not retried here. The key lives
 * in this call only.
 */

export interface RunChatOptions {
  manifest: ProviderManifest;
  config: ProviderCallConfig;
  request: ChatRequest;
  handlers?: StreamHandlers;
  rules?: readonly RequestRule[];
}

const DEFAULT_TIMEOUT_MS = 120_000;

function stopReasonOf(state: StreamState, aborted: boolean): StopReason {
  if (aborted) {
    return "aborted";
  }
  if (state.finishReason === "content_filter" || state.finishReason === "content-filter") {
    return "filtered";
  }
  if (state.part || !state.sawEnd) {
    return "partial";
  }
  if (state.finishReason === "length" || state.finishReason === "max_tokens") {
    return "length";
  }
  return "complete";
}

function readStream(
  manifest: ProviderManifest,
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<StreamState> {
  switch (manifest.wireFormat) {
    case "openai-chat":
      return readOpenAiStream(body, handlers);
    case "anthropic-messages":
      return readAnthropicStream(body, handlers);
    case "ollama-chat":
      return readOllamaStream(body, handlers);
    default:
      throw KeyrigError.fromCategory("invalid_request", {
        code: "no_adapter_for_wire_format",
        message: "keyrig has no adapter for this provider.",
      });
  }
}

export async function runChat(options: RunChatOptions): Promise<ChatResult> {
  const { manifest, config, request, handlers = {} } = options;
  const call = prepareCall(manifest, config, DEFAULT_TIMEOUT_MS);

  const warnings: string[] = [];
  if (config.baseUrl !== undefined && call.urlCheck.warning !== null) {
    warnings.push(call.urlCheck.warning);
  }

  const plan = planRequest(
    {
      manifest,
      baseUrl: call.baseUrl,
      ...(call.apiKey.length > 0 ? { apiKey: call.apiKey } : {}),
      model: request.model,
      intent: {
        kind: "chat",
        stream: true,
        messages: request.messages,
        ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.promptCache !== undefined ? { promptCache: request.promptCache } : {}),
        ...(request.tools !== undefined ? { tools: request.tools } : {}),
      },
    },
    options.rules,
  );

  const response = await fetchProvider(call, manifest, plan.url, {
    method: "POST",
    headers: { ...plan.headers, ...(config.headers ?? {}) },
    body: JSON.stringify(plan.body),
  });

  if (!response.body) {
    throw KeyrigError.fromCategory("server", {
      code: "empty_response_body",
      message: "The provider sent no answer. Try again.",
    });
  }

  let parsed: StreamState;
  try {
    parsed = await readStream(manifest, response.body, handlers);
  } catch (error) {
    if (call.aborted()) {
      throw KeyrigError.fromCategory("cancelled");
    }
    if (call.timedOut()) {
      throw KeyrigError.fromCategory("timeout", { details: { timeoutMs: call.timeoutMs } });
    }
    throw classifyThrown(error, call.secrets);
  }

  if (call.timedOut() && !call.aborted()) {
    throw KeyrigError.fromCategory("timeout", {
      details: { timeoutMs: call.timeoutMs, partialChars: parsed.text.length },
    });
  }

  handlers.onUsage?.(parsed.usage);
  const aborted = call.aborted();

  return {
    text: parsed.text,
    reasoning: parsed.reasoning,
    usage: parsed.usage,
    finishReason: parsed.finishReason,
    partial: parsed.part || aborted,
    aborted,
    stopReason: stopReasonOf(parsed, aborted),
    model: request.model,
    providerId: manifest.id,
    ...(parsed.requestId !== undefined ? { requestId: parsed.requestId } : {}),
    ...(parsed.toolCalls.length > 0 ? { toolCalls: parsed.toolCalls } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
