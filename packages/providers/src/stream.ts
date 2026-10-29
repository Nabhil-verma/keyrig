import { KeyrigError } from "@keyrig/shared";
import { readAnthropicStream } from "./adapters/anthropic";
import { readOllamaStream } from "./adapters/ollama";
import { readOpenAiStream, type ParsedStream } from "./adapters/openai";
import { classifyThrown, providerHttpError } from "./classify";
import { checkBaseUrl, type ProviderManifest } from "./manifest";
import { planRequest, type RequestRule } from "./rules";
import type { ChatRequest, ChatResult, ProviderCallConfig, StopReason, StreamHandlers } from "./types";

/**
 * One chat request, end to end (PV-08).
 *
 * - The caller can abort at any time. The adapter keeps the text it already has.
 * - A broken stream is marked "partial". It is not retried here.
 * - The key is used for this request only. It is never stored.
 */

export interface RunChatOptions {
  manifest: ProviderManifest;
  config: ProviderCallConfig;
  request: ChatRequest;
  handlers?: StreamHandlers;
  rules?: readonly RequestRule[];
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_ERROR_BODY = 8192;

function stopReasonOf(state: ParsedStream, aborted: boolean): StopReason {
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

export async function runChat(options: RunChatOptions): Promise<ChatResult> {
  const { manifest, config, request, handlers = {} } = options;
  const apiKey = config.apiKey?.trim() ?? "";

  if (manifest.authType === "api-key" && apiKey.length === 0) {
    throw KeyrigError.fromCategory("auth", {
      code: "missing_api_key",
      message: "keyrig has no key for this provider. Add a key and try again.",
    });
  }

  const baseUrl = config.baseUrl && config.baseUrl.trim().length > 0 ? config.baseUrl.trim() : manifest.baseUrl;
  const urlCheck = checkBaseUrl(baseUrl);
  if (!urlCheck.allowed) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "blocked_base_url",
      message: urlCheck.warning ?? "keyrig blocked the base URL.",
      details: { reason: urlCheck.reason },
    });
  }

  const warnings: string[] = [];
  if (config.baseUrl !== undefined && urlCheck.warning !== null) {
    warnings.push(urlCheck.warning);
  }

  const plan = planRequest(
    {
      manifest,
      baseUrl,
      ...(apiKey.length > 0 ? { apiKey } : {}),
      model: request.model,
      intent: {
        kind: "chat",
        stream: true,
        messages: request.messages,
        ...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.promptCache !== undefined ? { promptCache: request.promptCache } : {}),
      },
    },
    options.rules,
  );

  const secrets = apiKey.length > 0 ? [apiKey] : [];
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  let timeoutSignal: AbortSignal | undefined;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    timeoutSignal.addEventListener("abort", () => {
      timedOut = true;
    }, { once: true });
  }
  const signal =
    config.signal && timeoutSignal
      ? AbortSignal.any([config.signal, timeoutSignal])
      : (config.signal ?? timeoutSignal);

  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(plan.url, {
      method: "POST",
      headers: { ...plan.headers, ...(config.headers ?? {}) },
      body: JSON.stringify(plan.body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (config.signal?.aborted === true) {
      throw KeyrigError.fromCategory("cancelled");
    }
    if (timedOut) {
      throw KeyrigError.fromCategory("timeout", { details: { timeoutMs } });
    }
    throw classifyThrown(error, secrets);
  }

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = (await response.text()).slice(0, MAX_ERROR_BODY);
    } catch {
      bodyText = "";
    }
    throw providerHttpError(response.status, bodyText, { response, secrets });
  }

  if (!response.body) {
    throw KeyrigError.fromCategory("server", {
      code: "empty_response_body",
      message: "The provider sent no answer. Try again.",
    });
  }

  let parsed: ParsedStream;
  try {
    switch (manifest.wireFormat) {
      case "openai-chat":
        parsed = await readOpenAiStream(response.body, handlers);
        break;
      case "anthropic-messages":
        parsed = await readAnthropicStream(response.body, handlers);
        break;
      case "ollama-chat":
        parsed = await readOllamaStream(response.body, handlers);
        break;
      default:
        throw KeyrigError.fromCategory("invalid_request", {
          code: "no_adapter_for_wire_format",
          message: "keyrig has no adapter for this provider.",
        });
    }
  } catch (error) {
    if (config.signal?.aborted === true) {
      throw KeyrigError.fromCategory("cancelled");
    }
    if (timedOut) {
      throw KeyrigError.fromCategory("timeout", { details: { timeoutMs } });
    }
    throw classifyThrown(error, secrets);
  }

  if (timedOut && config.signal?.aborted !== true) {
    throw KeyrigError.fromCategory("timeout", { details: { timeoutMs, partialChars: parsed.text.length } });
  }

  handlers.onUsage?.(parsed.usage);

  const aborted = config.signal?.aborted === true;
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
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
