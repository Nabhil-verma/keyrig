import { describe, expect, it } from "vitest";
import { readNdjson, readSse } from "../wire/sse";

function oneChunk(chunk: string, onCancel: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      onCancel();
    },
  });
}

describe("PV-08 stream reader cleanup", () => {
  it("cancels the body when a stream line is not JSON", async () => {
    let cancelled = false;
    const body = oneChunk("not json\n", () => {
      cancelled = true;
    });
    await expect(readNdjson(body, () => undefined)).rejects.toMatchObject({ code: "bad_stream_line" });
    expect(cancelled).toBe(true);
  });

  it("cancels the body when an event handler stops the read", async () => {
    let cancelled = false;
    const body = oneChunk("data: {}\n\n", () => {
      cancelled = true;
    });
    await expect(
      readSse(body, () => {
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    expect(cancelled).toBe(true);
  });
});
