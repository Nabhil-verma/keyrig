import { describe, expect, it } from "vitest";
import { trimExchanges } from "./trimMessages";
import type { UIMessage } from "./types";

function exchange(question: string): UIMessage[] {
  const at = new Date().toISOString();
  return [
    { id: `${question}-q`, role: "user", content: question, at },
    { id: `${question}-a`, role: "assistant", content: `answer to ${question}`, at },
  ];
}

function thread(count: number): UIMessage[] {
  return Array.from({ length: count }, (_, index) => exchange(`q${index + 1}`)).flat();
}

describe("trimExchanges (ER-04)", () => {
  it("keeps a thread that has no older exchange", () => {
    const messages = thread(3);
    expect(trimExchanges(messages)).toEqual(messages);
  });

  it("drops the oldest exchanges and keeps the newest four", () => {
    const trimmed = trimExchanges(thread(6));
    expect(trimmed).toHaveLength(8);
    expect(trimmed[0]?.content).toBe("q3");
  });

  it("starts on a user message, so no answer is orphaned", () => {
    expect(trimExchanges(thread(6))[0]?.role).toBe("user");
  });

  it("keeps the exchange that holds the failed answer", () => {
    const trimmed = trimExchanges(thread(6), 2);
    expect(trimmed[0]?.content).toBe("q5");
    expect(trimmed[trimmed.length - 1]?.id).toBe("q6-a");
  });

  it("never keeps fewer than two exchanges", () => {
    expect(trimExchanges(thread(4), 0)).toHaveLength(4);
  });
});
