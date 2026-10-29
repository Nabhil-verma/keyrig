import { providerStreamError } from "../classify";
import { isAbortError, readNdjson } from "../sse";
import type { StreamHandlers } from "../types";
import type { ParsedStream } from "./openai";

interface OllamaLine {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export async function readOllamaStream(
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
    await readNdjson<OllamaLine>(body, (line) => {
      if (line.error) {
        throw providerStreamError(line.error);
      }
      const text = line.message?.content;
      if (typeof text === "string" && text.length > 0) {
        state.text += text;
        handlers.onDelta?.(text);
      }
      const thinking = line.message?.thinking;
      if (typeof thinking === "string" && thinking.length > 0) {
        state.reasoning += thinking;
        handlers.onReasoningDelta?.(thinking);
      }
      if (line.done === true) {
        state.sawEnd = true;
        state.finishReason = line.done_reason ?? "stop";
        state.usage = {
          inputTokens: line.prompt_eval_count ?? 0,
          outputTokens: line.eval_count ?? 0,
        };
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
