import { providerStreamError } from "../wire/classify";
import { isAbortError, readSse } from "../wire/sse";
import type { StreamHandlers, StreamState, ToolCall, Usage } from "../wire/types";

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  id?: string;
  error?: { message?: string; type?: string; code?: string };
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: OpenAiToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAiUsage | null;
}

export function normalizeOpenAiUsage(usage: OpenAiUsage | null | undefined): Usage {
  const prompt = usage?.prompt_tokens ?? 0;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoning = usage?.completion_tokens_details?.reasoning_tokens;
  return {
    inputTokens: Math.max(prompt - cached, 0),
    outputTokens: usage?.completion_tokens ?? 0,
    ...(cached > 0 ? { cachedTokens: cached } : {}),
    ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
  };
}

export function emptyStreamState(): StreamState {
  return {
    text: "",
    reasoning: "",
    usage: { inputTokens: 0, outputTokens: 0 },
    finishReason: null,
    toolCalls: [],
    sawEnd: false,
    part: false,
  };
}

export async function readOpenAiStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
): Promise<StreamState> {
  const state = emptyStreamState();

  // The provider sends one call in parts. Join the parts by index before the end.
  const partial = new Map<number, { id: string; name: string; arguments: string }>();
  const collect = (delta: OpenAiToolCallDelta): void => {
    const index = delta.index ?? 0;
    const current = partial.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id.length > 0) {
      current.id = delta.id;
    }
    if (typeof delta.function?.name === "string" && delta.function.name.length > 0) {
      current.name = current.name.length === 0 ? delta.function.name : current.name + delta.function.name;
    }
    if (typeof delta.function?.arguments === "string") {
      current.arguments += delta.function.arguments;
    }
    partial.set(index, current);
  };

  const flush = (): void => {
    state.toolCalls = [...partial.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => ({
        id: call.id.length > 0 ? call.id : `call_${index}`,
        name: call.name,
        arguments: call.arguments.length > 0 ? call.arguments : "{}",
      }))
      .filter((call): call is ToolCall => call.name.length > 0);
  };

  try {
    await readSse(body, ({ data }) => {
      if (data === "[DONE]") {
        state.sawEnd = true;
        return;
      }
      let chunk: OpenAiChunk;
      try {
        chunk = JSON.parse(data) as OpenAiChunk;
      } catch {
        state.part = true;
        return;
      }
      if (chunk.error) {
        throw providerStreamError(JSON.stringify(chunk.error));
      }
      if (chunk.id && state.requestId === undefined) {
        state.requestId = chunk.id;
      }
      if (chunk.usage) {
        state.usage = normalizeOpenAiUsage(chunk.usage);
      }
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) {
        state.finishReason = choice.finish_reason;
      }
      const delta = choice?.delta;
      if (delta?.tool_calls !== undefined) {
        for (const call of delta.tool_calls) {
          collect(call);
        }
      }
      const text = delta?.content;
      if (typeof text === "string" && text.length > 0) {
        state.text += text;
        handlers.onDelta?.(text);
      }
      const reasoning = delta?.reasoning_content ?? delta?.reasoning;
      if (typeof reasoning === "string" && reasoning.length > 0) {
        state.reasoning += reasoning;
        handlers.onReasoningDelta?.(reasoning);
      }
    });
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
    state.part = true;
  }

  flush();
  if (!state.sawEnd && state.finishReason === null) {
    state.part = true;
  }
  return state;
}
