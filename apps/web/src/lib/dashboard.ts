import type { StorageLike } from "@keyrig/shared";
import { accountStorage } from "@keyrig/core";
import { readThreads, type StoredThread } from "../stores/threads";
import { readSpendHistory, type SpendDay } from "../stores/spendStore";
import { readStreak, type StreakState } from "./streak";

/**
 * Phase 1: the pure parts of the Home dashboard.
 *
 * The functions read the records that this browser holds. They call no server
 * (PR-05) and they show no key secret (KS-04, PR-02).
 */

export interface DashboardRecords {
  threads: StoredThread[];
  spendDays: SpendDay[];
  streak: StreakState;
}

export interface RecentChat {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  messageCount: number;
}

export interface ArenaRunCard {
  threadId: string;
  title: string;
  prompt: string;
  at: string;
  models: string[];
  costUsd: number;
}

export interface WeekCost {
  /** The total of the last seven UTC days, oldest first. */
  totalUsd: number;
  days: SpendDay[];
  /** The estimated share that has a price. Always true for a stored cost. */
  estimated: true;
}

const PREVIEW_LIMIT = 120;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Read the records of one account. The chats belong to the account. The spend
 * belongs to the device, because the budget limit is a device setting (CO-02).
 * A broken record reads as an empty list.
 */
export function readDashboardRecords(storage: StorageLike, username: string): DashboardRecords {
  const accountStore = accountStorage(storage, username);
  return {
    threads: readThreads(accountStore),
    spendDays: readSpendHistory(storage),
    streak: readStreak(storage),
  };
}

function previewOf(thread: StoredThread): string {
  const first = thread.messages.find((message) => message.role === "user");
  const text = (first?.display ?? first?.content ?? thread.title).replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…` : text;
}

/** The newest chats that hold a message. A blank chat is not a recent chat. */
export function recentChats(threads: readonly StoredThread[], limit = 4): RecentChat[] {
  return threads
    .filter((thread) => thread.messages.length > 0)
    .slice()
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    .slice(0, limit)
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      preview: previewOf(thread),
      messageCount: thread.messages.length,
    }));
}

/** UX-01: the saved arena runs, newest first. */
export function arenaRuns(threads: readonly StoredThread[], limit = 3): ArenaRunCard[] {
  const runs: ArenaRunCard[] = [];
  for (const thread of threads) {
    if (thread.arena === undefined) {
      continue;
    }
    runs.push({
      threadId: thread.id,
      title: thread.title,
      prompt: thread.arena.prompt,
      at: thread.arena.at,
      models: thread.arena.results.map((result) => result.model),
      costUsd: thread.arena.results.reduce((sum, result) => sum + result.costUsd, 0),
    });
  }
  return runs.sort((left, right) => (left.at < right.at ? 1 : -1)).slice(0, limit);
}

/**
 * CO-02: the cost of the last seven UTC days. A day with no record counts as
 * zero. The card marks the total as estimated, because a price can change.
 */
export function weekCost(days: readonly SpendDay[], now: Date = new Date()): WeekCost {
  const wanted: string[] = [];
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(now.getTime() - index * 86_400_000);
    wanted.push(dayKey(day));
  }
  const byDay = new Map(days.map((entry) => [entry.day, entry.usd]));
  const week = wanted.map((day) => ({ day, usd: byDay.get(day) ?? 0 }));
  const total = week.reduce((sum, entry) => sum + entry.usd, 0);
  return { totalUsd: Math.round(total * 10_000) / 10_000, days: week, estimated: true };
}

/**
 * KS-04 and PR-02: a key shows its label and the last four characters.
 * The function takes a view that holds no secret, so a secret cannot be shown.
 */
export function keyLabelText(key: { label: string; last4: string }): string {
  return `${key.label} ••••${key.last4}`;
}

/** The greeting name. The display name wins, then the account name. */
export function greetingName(displayName: string, username: string): string {
  const name = displayName.trim();
  return name.length > 0 ? name : username;
}


