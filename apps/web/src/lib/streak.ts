import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * Phase 6: the streak.
 *
 * A streak is a run of local days with at least one answer. The record lives on
 * this device only. keyrig never sends it to the backend (PR-05). A missed day
 * ends the run, and the best run stays, so the card never scolds.
 */

export const STREAK_STORAGE_KEY = "keyrig.streak.v1";
export const STREAK_SCHEMA_VERSION = 1;
export const MAX_STREAK_DAYS = 400;

export interface StreakState {
  days: string[];
  best: number;
}

export interface StreakSummary {
  current: number;
  best: number;
  activeToday: boolean;
  totalDays: number;
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

/** The local day, so the streak follows the clock on this device. */
export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function previousDay(day: string): string {
  const parsed = Date.parse(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return day;
  }
  return new Date(parsed - 86_400_000).toISOString().slice(0, 10);
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readStreak(storage: StorageLike): StreakState {
  let raw: string | null;
  try {
    raw = storage.getItem(STREAK_STORAGE_KEY);
  } catch {
    return { days: [], best: 0 };
  }
  if (!raw) {
    return { days: [], best: 0 };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== STREAK_SCHEMA_VERSION) {
      return { days: [], best: 0 };
    }
    const data = parsed.data as { days?: unknown; best?: unknown } | null;
    if (data === null || typeof data !== "object" || !Array.isArray(data.days)) {
      return { days: [], best: 0 };
    }
    const days = (data.days as unknown[])
      .filter(isDay)
      .sort()
      .slice(-MAX_STREAK_DAYS);
    const best = typeof data.best === "number" && Number.isFinite(data.best) ? Math.max(0, data.best) : 0;
    return { days, best };
  } catch {
    return { days: [], best: 0 };
  }
}

/** The run that ends today, or yesterday when today has no answer yet. */
export function streakSummary(state: StreakState, today: string = localDay()): StreakSummary {
  const days = new Set(state.days);
  const activeToday = days.has(today);
  let cursor: string | null = activeToday ? today : days.has(previousDay(today)) ? previousDay(today) : null;
  let current = 0;
  while (cursor !== null && days.has(cursor)) {
    current += 1;
    cursor = previousDay(cursor);
  }
  return {
    current,
    best: Math.max(state.best, current),
    activeToday,
    totalDays: state.days.length,
  };
}

/** Record one answer today and return the new state. */
export function recordActivity(storage: StorageLike, day: string = localDay()): StreakState {
  const state = readStreak(storage);
  const days = [...new Set([...state.days, day])].sort().slice(-MAX_STREAK_DAYS);
  const summary = streakSummary({ days, best: state.best }, day);
  const next: StreakState = { days, best: Math.max(state.best, summary.best) };
  try {
    storage.setItem(STREAK_STORAGE_KEY, JSON.stringify(createDocument(STREAK_SCHEMA_VERSION, next)));
  } catch {
    // A full storage must not stop an answer.
  }
  return next;
}
