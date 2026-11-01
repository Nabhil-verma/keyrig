import { describe, expect, it } from "vitest";
import { createDeltaBuffer } from "./deltaBuffer";

describe("the delta buffer (PV-08 performance)", () => {
  it("joins many deltas into one flush per frame", () => {
    const flushes: string[] = [];
    const queue: Array<() => void> = [];
    const buffer = createDeltaBuffer(
      (text) => flushes.push(text),
      (callback) => queue.push(callback),
    );

    const tokens = Array.from({ length: 500 }, (_value, index) => `t${index}`);
    for (const token of tokens) {
      buffer.push(token);
    }

    // One render for the whole frame, not one for each token.
    expect(flushes).toHaveLength(0);
    expect(queue).toHaveLength(1);

    queue.shift()?.();
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toBe(tokens.join(""));

    buffer.push("next");
    expect(queue).toHaveLength(1);
    queue.shift()?.();
    expect(flushes[1]).toBe("next");
  });

  it("does not flush when there is nothing to send", () => {
    const flushes: string[] = [];
    const buffer = createDeltaBuffer(
      (text) => flushes.push(text),
      (callback) => callback(),
    );
    buffer.push("");
    buffer.flush();
    expect(flushes).toHaveLength(0);
  });

  it("drops the pending text on clear", () => {
    const flushes: string[] = [];
    const queue: Array<() => void> = [];
    const buffer = createDeltaBuffer(
      (text) => flushes.push(text),
      (callback) => queue.push(callback),
    );
    buffer.push("part");
    expect(buffer.pending()).toBe(1);

    buffer.clear();
    queue[0]?.();
    expect(flushes).toHaveLength(0);
    expect(buffer.pending()).toBe(0);
  });
});
