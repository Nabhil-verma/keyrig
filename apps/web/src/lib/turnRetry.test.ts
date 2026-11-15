import { describe, expect, it } from "vitest";
import { createToolRunTracker, retryMode } from "./turnRetry";

describe("HACK-01 and PV-08 the retry of a tool turn", () => {
  it("PV-09 a new turn has no tool behind the first model call", () => {
    const tracker = createToolRunTracker();
    expect(tracker.ran).toBe(false);
  });

  it("PV-08 counts a tool that started, because it can have an effect", () => {
    const tracker = createToolRunTracker();
    tracker.note("running");
    expect(tracker.ran).toBe(true);
  });

  it("PV-08 counts a tool that finished or failed", () => {
    const done = createToolRunTracker();
    done.note("done");
    const failed = createToolRunTracker();
    failed.note("error");
    expect(done.ran).toBe(true);
    expect(failed.ran).toBe(true);
  });

  it("PV-08 keeps the retry when keyrig blocked the call or the user denied it", () => {
    const tracker = createToolRunTracker();
    tracker.note("blocked");
    tracker.note("denied");
    expect(tracker.ran).toBe(false);
  });
});

describe("BUG-03 the retry keeps the tools of the turn", () => {
  it("BUG-03 retries a stored tool turn with the tools path", () => {
    expect(retryMode({ mode: "tools" })).toBe("tools");
  });

  it("BUG-03 retries an old message with no mode as a chat turn", () => {
    expect(retryMode({})).toBe("chat");
  });

  it("BUG-03 keeps the stored mode after the user turns the tools off", () => {
    // The live tool switch is not an input. The turn keeps the mode that started it.
    expect(retryMode({ mode: "tools" })).toBe("tools");
  });
});
