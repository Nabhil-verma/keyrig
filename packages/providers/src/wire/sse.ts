import { KeyrigError } from "@keyrig/shared";

export interface SseEvent {
  event: string;
  data: string;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Read a body as text. The decoder holds a character that a chunk splits, and
 * every chunk uses one line end, so the two parsers below need no escape logic.
 */
async function readText(
  body: ReadableStream<Uint8Array>,
  onText: (text: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      onText(decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n"));
    }
    onText(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

function dispatchSseBlock(block: string, onEvent: (event: SseEvent) => void): void {
  if (block.length === 0) {
    return;
  }
  let event = "";
  const data: string[] = [];
  for (const rawLine of block.split("\n")) {
    if (rawLine.startsWith(":")) {
      continue;
    }
    const separator = rawLine.indexOf(":");
    const field = separator === -1 ? rawLine : rawLine.slice(0, separator);
    const rawValue = separator === -1 ? "" : rawLine.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  if (data.length > 0) {
    onEvent({ event, data: data.join("\n") });
  }
}

/** Read one SSE stream. The reader keeps no full body, only the open block. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  let buffer = "";
  await readText(body, (text) => {
    buffer += text;
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      dispatchSseBlock(buffer.slice(0, index), onEvent);
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
    }
  });
  dispatchSseBlock(buffer, onEvent);
}

function dispatchJsonLine<T>(line: string, onLine: (value: T) => void): void {
  const text = line.trim();
  if (text.length === 0) {
    return;
  }
  try {
    onLine(JSON.parse(text) as T);
  } catch {
    throw KeyrigError.fromCategory("server", {
      code: "bad_stream_line",
      message: "The provider sent a line that keyrig cannot read.",
    });
  }
}

/** Read one NDJSON stream (Ollama). */
export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onLine: (value: T) => void,
): Promise<void> {
  let buffer = "";
  await readText(body, (text) => {
    buffer += text;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      dispatchJsonLine(buffer.slice(0, index), onLine);
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  });
  dispatchJsonLine(buffer, onLine);
}
