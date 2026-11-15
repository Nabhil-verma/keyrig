import { describe, expect, it } from "vitest";
import type { StoredThread } from "../stores/threads";
import { fileSafeName, threadToMarkdown } from "./threadExport";
import { receiptTotals, threadReceiptSvg } from "./receipt";

const thread: StoredThread = {
  id: "thread_1",
  title: "Plan <the> landing",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:01:00.000Z",
  messages: [
    { id: "m1", role: "user", content: "Plan the landing", at: "2026-11-01T10:00:00.000Z" },
    {
      id: "m2",
      role: "assistant",
      content: "Start with the hero.",
      at: "2026-11-01T10:01:00.000Z",
      model: "gpt-5.4",
      providerId: "openai",
      keyLabel: "work",
      costUsd: 0.0042,
      pricingKnown: true,
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 40,
      cacheWriteTokens: 10,
      stopReason: "complete",
    },
  ],
};

describe("the thread export", () => {
  it("writes the prompt, the answer and the facts of each answer", () => {
    const markdown = threadToMarkdown(thread);
    expect(markdown).toContain("# Plan <the> landing");
    expect(markdown).toContain("## You\n\nPlan the landing");
    expect(markdown).toContain("## gpt-5.4");
    expect(markdown).toContain("key work");
    expect(markdown).toContain("120 in / 30 out");
    expect(markdown).toContain("40 cached");
    expect(markdown).toContain("10 written");
    expect(markdown).toContain("$0.00420 estimated");
  });

  it("marks an unknown price", () => {
    const unknown: StoredThread = {
      ...thread,
      messages: [{ ...thread.messages[1]!, pricingKnown: false }],
    };
    expect(threadToMarkdown(unknown)).toContain("cost unknown");
  });

  it("makes a safe file name", () => {
    expect(fileSafeName("Plan the Landing!")).toBe("plan-the-landing");
    expect(fileSafeName("***")).toBe("keyrig-thread");
  });
});

describe("the thread receipt", () => {
  it("adds the totals of the answers", () => {
    expect(receiptTotals(thread)).toMatchObject({
      answers: 1,
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 40,
      cacheWriteTokens: 10,
      pricingKnown: true,
      models: ["gpt-5.4"],
      keyLabels: ["work"],
    });
  });

  it("keeps a long token row inside the card", () => {
    const big: StoredThread = {
      ...thread,
      messages: [
        {
          ...thread.messages[1]!,
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cachedTokens: 1_000_000,
          cacheWriteTokens: 1_000_000,
        },
      ],
    };
    expect(threadReceiptSvg(big)).toContain('font-size="13"');
  });

  it("escapes the title and keeps the cost in the card", () => {
    const svg = threadReceiptSvg(thread);
    expect(svg).toContain("Plan &lt;the&gt; landing");
    expect(svg).toContain("$0.00420 estimated");
    expect(svg).toContain("40 cached");
    expect(svg).toContain("10 written");
    expect(svg).toContain("KEYRIG");
  });
});
