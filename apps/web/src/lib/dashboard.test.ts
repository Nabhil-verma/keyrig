import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import type { ArenaRun, UIMessage } from "./types";
import type { StoredThread } from "../stores/threads";
import {
  arenaRuns,
  greetingName,
  keyLabelText,
  readDashboardRecords,
  recentChats,
  weekCost,
} from "./dashboard";
import { recordActivity, STREAK_STORAGE_KEY } from "./streak";

function user(text: string, at: string): UIMessage {
  return { id: `m_${text}`, role: "user", content: text, at };
}

function thread(id: string, title: string, updatedAt: string, messages: UIMessage[] = []): StoredThread {
  return { id, title, createdAt: updatedAt, updatedAt, messages };
}

const arena: ArenaRun = {
  prompt: "Compare two plans",
  at: "2026-11-03T10:00:00.000Z",
  results: [
    {
      model: "gpt-5.4",
      text: "Plan A",
      durationMs: 900,
      costUsd: 0.02,
      pricingKnown: true,
      inputTokens: 10,
      outputTokens: 20,
    },
    {
      model: "claude",
      text: "Plan B",
      durationMs: 1100,
      costUsd: 0.03,
      pricingKnown: true,
      inputTokens: 10,
      outputTokens: 24,
    },
  ],
};

describe("CO-02 the week cost adds the stored days of one device", () => {
  it("sums the last seven UTC days and counts a missing day as zero", () => {
    const week = weekCost(
      [
        { day: "2026-10-28", usd: 1 },
        { day: "2026-11-02", usd: 0.5 },
        { day: "2026-11-04", usd: 0.25 },
      ],
      new Date("2026-11-04T12:00:00.000Z"),
    );

    expect(week.days.map((day) => day.day)).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(week.totalUsd).toBe(0.75);
    expect(week.estimated).toBe(true);
  });

  it("does not count a day outside the week", () => {
    const week = weekCost([{ day: "2026-10-01", usd: 9 }], new Date("2026-11-04T12:00:00.000Z"));
    expect(week.totalUsd).toBe(0);
  });
});

describe("UX-01 the dashboard shows the saved arena runs", () => {
  it("lists the runs newest first with their models and cost", () => {
    const older: StoredThread = {
      ...thread("t1", "Plans", "2026-11-02T09:00:00.000Z", [user("hello", "2026-11-02T09:00:00.000Z")]),
      arena: { ...arena, at: "2026-11-02T09:00:00.000Z" },
    };
    const newer: StoredThread = {
      ...thread("t2", "Two models", "2026-11-03T10:00:00.000Z", [user("hello", "2026-11-03T10:00:00.000Z")]),
      arena,
    };

    const runs = arenaRuns([older, newer]);

    expect(runs).toHaveLength(2);
    expect(runs[0]?.threadId).toBe("t2");
    expect(runs[0]?.models).toEqual(["gpt-5.4", "claude"]);
    expect(runs[0]?.costUsd).toBeCloseTo(0.05);
  });

  it("shows no run when a chat has no arena record", () => {
    expect(arenaRuns([thread("t1", "Chat", "2026-11-04T09:00:00.000Z")])).toEqual([]);
  });
});

describe("PR-02 the dashboard shows the source of an answer", () => {
  it("shows the newest chats with their title and count", () => {
    const chats = recentChats([
      thread("a", "Old", "2026-11-01T09:00:00.000Z", [user("old", "2026-11-01T09:00:00.000Z")]),
      thread("b", "New", "2026-11-04T09:00:00.000Z", [user("new prompt", "2026-11-04T09:00:00.000Z")]),
      thread("c", "Blank", "2026-11-04T10:00:00.000Z"),
    ]);

    expect(chats.map((chat) => chat.title)).toEqual(["New", "Old"]);
    expect(chats[0]?.preview).toBe("new prompt");
  });

  it("shows the greeting name and no empty name", () => {
    expect(greetingName("", "alice")).toBe("alice");
    expect(greetingName("  Alex ", "alice")).toBe("Alex");
  });
});

describe("KS-04 a key card shows only the label and the last four characters", () => {
  it("masks the key", () => {
    expect(keyLabelText({ label: "work", last4: "9f2c" })).toBe("work ••••9f2c");
  });
});

describe("Phase 6 the dashboard reads the streak of this device", () => {
  it("returns the streak with the account chats and the device spend", () => {
    const storage = createMemoryStorage();
    recordActivity(storage, "2026-11-03");
    recordActivity(storage, "2026-11-04");

    const records = readDashboardRecords(storage, "alice");

    expect(records.threads).toEqual([]);
    expect(records.streak).toEqual({ days: ["2026-11-03", "2026-11-04"], best: 2 });
  });

  it("reads a broken streak record as an empty run", () => {
    const storage = createMemoryStorage({ [STREAK_STORAGE_KEY]: "{not json" });
    expect(readDashboardRecords(storage, "alice").streak).toEqual({ days: [], best: 0 });
  });
});
