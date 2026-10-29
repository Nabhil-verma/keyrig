import { providerStreamError } from "../classify";
import { isAbortError, readSse } from "../sse";
import type { StreamHandlers, Usage } from "../types";

export interface ParsedStream {
  text: string;
  reasoning: string;
  usage: Usage;
  finishReason: string | null;
  requestId?: string;
  sawEnd: boolean;
  part: boolean;
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface OpenAiChunk {
  id?: string;
  error?: { message?: string; type?: string; code?: string };
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
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

export async function readOpenAiStream(
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

  if (!state.sawEnd && state.finishReason === null) {
    state.part = true;
  }
  return state;
}
