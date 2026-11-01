/**
 * CO-02: a daily budget with a warning at 80 percent and a stop at 100 percent.
 *
 * The math is pure and holds no storage, so a test needs no browser. The app
 * keeps the number for the day and calls this function before each send.
 */

export const BUDGET_WARNING_RATIO = 0.8;
export const MIN_BUDGET_USD = 0.01;
export const MAX_BUDGET_USD = 1000;

export type BudgetLevel = "off" | "ok" | "warning" | "blocked";

export interface BudgetState {
  /** null means no limit. */
  limitUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
  /** The spent part of the limit, from 0 to 1 or more. 0 when the limit is off. */
  ratio: number;
  level: BudgetLevel;
}

/** A count of money is never negative and never NaN. */
export function normalizeSpend(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

/** A limit outside the range is no limit. The form shows the range. */
export function normalizeBudgetLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < MIN_BUDGET_USD || value > MAX_BUDGET_USD) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function budgetState(spentUsd: number, limitUsd: number | null | undefined): BudgetState {
  const spent = normalizeSpend(spentUsd);
  const limit = normalizeBudgetLimit(limitUsd);

  if (limit === null) {
    return { limitUsd: null, spentUsd: spent, remainingUsd: null, ratio: 0, level: "off" };
  }

  const ratio = spent / limit;
  const remaining = Math.max(limit - spent, 0);
  const level: BudgetLevel = spent >= limit ? "blocked" : ratio >= BUDGET_WARNING_RATIO ? "warning" : "ok";

  return { limitUsd: limit, spentUsd: spent, remainingUsd: remaining, ratio, level };
}

/** One sentence for the user. It names the next step, not only the state. */
export function budgetMessage(state: BudgetState): string | null {
  if (state.level === "warning") {
    const percent = Math.round(state.ratio * 100);
    return `The daily budget is ${percent} percent spent. Change the limit in Settings if you need more.`;
  }
  if (state.level === "blocked") {
    return "The daily budget is spent. Change the limit in Settings, or continue this session.";
  }
  return null;
}
