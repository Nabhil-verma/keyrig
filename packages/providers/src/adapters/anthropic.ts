import { providerStreamError } from "../classify";
import { isAbortError, readSse } from "../sse";
import type { StreamHandlers } from "../types";
import type { ParsedStream } from "./openai";

/**
 * Anthropic sends typed events. The input token count arrives at the start.
 * The output token count arrives at the end.
 */
interface AnthropicUsage {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicEvent {
  type?: string;
  index?: number;
  message?: {
    id?: string;
    usage?: AnthropicUsage;
  };
  delta?: { type?: string; text?: string; thinking?: string; stop_reason?: string | null };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

export async function readAnthropicStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<ParsedStream> {
  const state: ParsedStream = {
    text: "",
    reasoning: "",
    usage: { inputTokens: 0, outputTokens: 0 },
    finishReason: null,
    sawEnd: false,
    part: false,
  };

  const addInput = (usage: AnthropicUsage | undefined): void => {
    const input = usage?.input_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    state.usage = {
      ...state.usage,
      inputTokens: input + cacheWrite,
      ...(cacheRead > 0 ? { cachedTokens: cacheRead } : {}),
    };
  };

  try {
    await readSse(body, ({ data }) => {
      let event: AnthropicEvent;
      try {
        event = JSON.parse(data) as AnthropicEvent;
      } catch {
        state.part = true;
        return;
      }

      switch (event.type) {
        case "message_start": {
          if (event.message?.id) {
            state.requestId = event.message.id;
          }
          if (event.message?.usage) {
            addInput(event.message.usage);
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            state.text += delta.text;
            handlers.onDelta?.(delta.text);
          }
          if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
            state.reasoning += delta.thinking;
            handlers.onReasoningDelta?.(delta.thinking);
          }
          break;
        }
        case "message_delta": {
          if (event.usage?.output_tokens !== undefined) {
            state.usage = { ...state.usage, outputTokens: event.usage.output_tokens };
          }
          if (event.delta?.stop_reason) {
            state.finishReason = event.delta.stop_reason;
          }
          break;
        }
        case "message_stop": {
          state.sawEnd = true;
          break;
        }
        case "error": {
          throw providerStreamError(JSON.stringify(event.error ?? event));
        }
        default:
          break;
      }
    });
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
    state.part = true;
  }

  if (!state.sawEnd) {
    state.part = true;
  }
  return state;
}
