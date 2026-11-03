import type { UIMessage } from "./types";

/** The newest exchanges that a shorten keeps. */
export const KEEP_EXCHANGES = 4;

/**
 * Drop the oldest exchanges of a thread (ER-04).
 *
 * An exchange starts at a user message and runs to the next user message, so a
 * slice never cuts a question away from its answer. The newest exchange always
 * stays, so the failed answer is kept when it is the newest one.
 */
export function trimExchanges(messages: readonly UIMessage[], keep = KEEP_EXCHANGES): UIMessage[] {
  const keepCount = Math.max(2, Math.floor(keep));
  const starts: number[] = [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      starts.push(index);
    }
  });
  if (starts.length <= keepCount) {
    return [...messages];
  }
  const cut = starts[starts.length - keepCount];
  return cut === undefined ? [...messages] : messages.slice(cut);
}
