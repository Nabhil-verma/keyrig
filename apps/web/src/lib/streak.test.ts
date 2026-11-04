import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import { localDay, readStreak, recordActivity, streakSummary } from "./streak";

describe("Phase 6 the streak counts a run of local days", () => {
  it("counts three days in a row and keeps the best", () => {
    const state = { days: ["2026-11-02", "2026-11-03", "2026-11-04"], best: 3 };
    const summary = streakSummary(state, "2026-11-04");

    expect(summary.current).toBe(3);
    expect(summary.best).toBe(3);
    expect(summary.activeToday).toBe(true);
  });

  it("keeps yesterday's run until today has an answer", () => {
    const summary = streakSummary({ days: ["2026-11-02", "2026-11-03"], best: 2 }, "2026-11-04");

    expect(summary.current).toBe(2);
    expect(summary.activeToday).toBe(false);
  });

  it("ends the run after a missed day", () => {
    const summary = streakSummary({ days: ["2026-11-01", "2026-11-02"], best: 2 }, "2026-11-04");

    expect(summary.current).toBe(0);
  });

  it("adds today once, even after two answers", () => {
    const storage = createMemoryStorage();
    recordActivity(storage, "2026-11-04");
    recordActivity(storage, "2026-11-04");

    expect(readStreak(storage).days).toEqual(["2026-11-04"]);
  });
});

describe("PR-05 the streak stays on this device", () => {
  it("writes one device record with days and a best count only", () => {
    const storage = createMemoryStorage();
    recordActivity(storage, "2026-11-04");

    const raw = storage.getItem("keyrig.streak.v1") ?? "";
    const parsed = JSON.parse(raw) as { data: Record<string, unknown> };

    expect(parsed.data.days).toEqual(["2026-11-04"]);
    expect(Object.keys(parsed.data).sort()).toEqual(["best", "days"]);
    expect(raw).not.toContain("sk-");
    expect(raw).not.toContain("messages");
  });

  it("uses the local day of the device", () => {
    expect(localDay(new Date(2026, 10, 4, 23, 59))).toBe("2026-11-04");
  });
});
