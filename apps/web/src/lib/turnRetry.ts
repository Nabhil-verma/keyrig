import type { AgentEvent } from "@keyrig/core";
import type { TurnMode, UIMessage } from "./types";

/**
 * BUG-03: a retry uses the mode that started the turn, not the live tool switch.
 * An old saved message has no mode, so it retries as a chat turn.
 */
export function retryMode(message: Pick<UIMessage, "mode">): TurnMode {
  return message.mode === "tools" ? "tools" : "chat";
}

/**
 * PV-08: keyrig does not retry a stream that already ran a tool.
 * A call that started can have an effect, so it counts. A blocked call and a
 * denied call ran nothing, so they keep the retry of PV-09.
 */
export function toolStarted(status: AgentEvent["status"]): boolean {
  return status === "running" || status === "done" || status === "error";
}

/** HACK-01: the tool record of one turn. Each turn makes a new tracker. */
export interface ToolRunTracker {
  note: (status: AgentEvent["status"]) => void;
  readonly ran: boolean;
}

export function createToolRunTracker(): ToolRunTracker {
  let ran = false;
  return {
    note(status) {
      if (toolStarted(status)) {
        ran = true;
      }
    },
    get ran() {
      return ran;
    },
  };
}
