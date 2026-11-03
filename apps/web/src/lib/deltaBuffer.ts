/**
 * One flush for each frame, not one render for each token.
 *
 * A provider sends a delta per token. A React state update per delta renders
 * the whole message list again, so a 900-token answer costs 900 renders. This
 * buffer joins the deltas and calls the handler once per frame. The text is
 * the same. The render count drops to the frame count.
 */

type Schedule = (callback: () => void) => void;

export interface DeltaBuffer {
  /** Add a delta. The first delta of a frame asks for one flush. */
  push(text: string): void;
  /** Send the text now. The success and error paths call this before the end. */
  flush(): void;
  /** Drop the text that did not flush yet. Use it before a full replace. */
  clear(): void;
  /** The number of deltas that wait for the frame. */
  pending(): number;
}

export function createDeltaBuffer(onFlush: (text: string) => void, schedule: Schedule): DeltaBuffer {
  let parts: string[] = [];
  let scheduled = false;

  const flush = (): void => {
    scheduled = false;
    if (parts.length === 0) {
      return;
    }
    const text = parts.join("");
    parts = [];
    if (text.length > 0) {
      onFlush(text);
    }
  };

  return {
    push(text) {
      if (typeof text !== "string" || text.length === 0) {
        return;
      }
      parts.push(text);
      if (!scheduled) {
        scheduled = true;
        schedule(flush);
      }
    },
    flush,
    clear() {
      parts = [];
      scheduled = false;
    },
    pending() {
      return parts.length;
    },
  };
}
