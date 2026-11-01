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
 * Read one SSE stream and call the handler for each event.
 *
 * The reader does not keep the whole body. It stops when the body ends or when
 * the caller aborts. An abort throws an AbortError. The adapter keeps the text
 * that it already received.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlock = (block: string): void => {
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
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        flushBlock(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    flushBlock(buffer.replace(/\r\n/g, "\n"));
  } finally {
    reader.releaseLock();
  }
}

/** Read one NDJSON stream (Ollama). */
export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onLine: (value: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string): void => {
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
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        flushLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    flushLine(buffer);
  } finally {
    reader.releaseLock();
  }
}
