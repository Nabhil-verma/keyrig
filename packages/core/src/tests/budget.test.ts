import { describe, expect, it } from "vitest";
import { budgetMessage, budgetState, normalizeBudgetLimit, normalizeSpend } from "../chat/budget";

describe("the daily budget (CO-02)", () => {
  it("stays off when there is no limit", () => {
    const state = budgetState(12, null);
    expect(state.level).toBe("off");
    expect(state.limitUsd).toBeNull();
    expect(state.remainingUsd).toBeNull();
    expect(budgetMessage(state)).toBeNull();
  });

  it("warns at 80 percent and stops at 100 percent", () => {
    expect(budgetState(0.79, 1).level).toBe("ok");
    expect(budgetState(0.8, 1).level).toBe("warning");
    expect(budgetState(1, 1).level).toBe("blocked");
    expect(budgetState(2, 1).level).toBe("blocked");
    expect(budgetState(2, 1).remainingUsd).toBe(0);
  });

  it("gives a message that names the next step", () => {
    expect(budgetMessage(budgetState(0.82, 1))).toContain("82 percent");
    expect(budgetMessage(budgetState(0.82, 1))).toContain("Settings");
    expect(budgetMessage(budgetState(1, 1))).toContain("Settings");
    expect(budgetMessage(budgetState(0.1, 1))).toBeNull();
  });

  it("keeps a spend that is not a real amount at zero", () => {
    expect(normalizeSpend(Number.NaN)).toBe(0);
    expect(normalizeSpend(-4)).toBe(0);
    expect(normalizeSpend("3")).toBe(0);
    expect(budgetState(Number.NaN, 1).spentUsd).toBe(0);
  });

  it("rejects a limit outside the range and rounds a real one", () => {
    expect(normalizeBudgetLimit(0)).toBeNull();
    expect(normalizeBudgetLimit(0.001)).toBeNull();
    expect(normalizeBudgetLimit(2000)).toBeNull();
    expect(normalizeBudgetLimit("5")).toBeNull();
    expect(normalizeBudgetLimit(undefined)).toBeNull();
    expect(normalizeBudgetLimit(1.239)).toBe(1.24);
  });
});
