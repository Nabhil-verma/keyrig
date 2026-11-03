import { createDocument, createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { addSpend, readSpend, readSpendHistory, utcDay } from "./spendStore";

describe("the daily spend record (CO-02)", () => {
  it("adds the costs of the day", () => {
    const storage = createMemoryStorage();
    expect(readSpend(storage)).toBe(0);
    expect(addSpend(storage, 0.25)).toBeCloseTo(0.25, 8);
    expect(addSpend(storage, 0.5)).toBeCloseTo(0.75, 8);
    expect(readSpend(storage)).toBeCloseTo(0.75, 8);
  });

  it("starts at zero on a new day", () => {
    const storage = createMemoryStorage();
    addSpend(storage, 2, "2026-10-31");
    expect(readSpend(storage, "2026-10-31")).toBe(2);
    expect(readSpend(storage, "2026-11-01")).toBe(0);
  });

  it("ignores a cost that is not a real amount", () => {
    const storage = createMemoryStorage();
    addSpend(storage, -5);
    addSpend(storage, Number.NaN);
    expect(readSpend(storage)).toBe(0);
  });

  it("reads zero from a broken record and keeps the day in UTC", () => {
    expect(readSpend(createMemoryStorage({ "keyrig.spend.v1": "not json" }))).toBe(0);
    expect(utcDay(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-01");
  });

  it("keeps the older days for the history", () => {
    const storage = createMemoryStorage();
    addSpend(storage, 1.5, "2026-10-30");
    addSpend(storage, 0.5, "2026-10-31");
    addSpend(storage, 2, "2026-11-01");

    const history = readSpendHistory(storage, 3, "2026-11-01");
    expect(history.map((entry) => entry.usd)).toEqual([1.5, 0.5, 2]);
    expect(history.at(-1)?.day).toBe("2026-11-01");
  });

  it("fills a day with no spend with zero", () => {
    const storage = createMemoryStorage();
    addSpend(storage, 3, "2026-11-01");
    expect(readSpendHistory(storage, 7, "2026-11-01")).toHaveLength(7);
    expect(readSpendHistory(storage, 7, "2026-11-01").at(-2)?.usd).toBe(0);
  });

  it("reads a v1 one-day record", () => {
    const storage = createMemoryStorage({
      "keyrig.spend.v1": JSON.stringify(createDocument(1, { day: "2026-11-01", usd: 4 })),
    });
    expect(readSpend(storage, "2026-11-01")).toBe(4);
    expect(addSpend(storage, 1, "2026-11-01")).toBe(5);
  });
});
