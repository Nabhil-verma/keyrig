import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * The money that this device spent (CO-02).
 *
 * The record keeps the last 31 UTC days, so the panel can show a week. The
 * record holds no key, no prompt and no model name.
 */

const SPEND_STORAGE_KEY = "keyrig.spend.v1";
const SPEND_SCHEMA_VERSION = 2;
const MAX_DAYS = 31;

/** The days that the inspector shows. */
export const SPEND_HISTORY_DAYS = 7;

export interface SpendDay {
  day: string;
  usd: number;
}

/** The UTC day. The hosted model counts its limits on the same day. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function readDay(value: unknown): SpendDay | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<SpendDay>;
  if (typeof record.day !== "string" || typeof record.usd !== "number") {
    return null;
  }
  if (!Number.isFinite(record.usd) || record.usd < 0) {
    return null;
  }
  return { day: record.day, usd: record.usd };
}

/** The saved days, oldest first. A v1 record reads as one day. */
function readDays(storage: StorageLike): SpendDay[] {
  let raw: string | null;
  try {
    raw = storage.getItem(SPEND_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed)) {
      return [];
    }
    if (parsed.schemaVersion === 1) {
      const day = readDay(parsed.data);
      return day === null ? [] : [day];
    }
    if (parsed.schemaVersion !== SPEND_SCHEMA_VERSION) {
      return [];
    }
    const data = parsed.data as { days?: unknown } | null;
    if (data === null || typeof data !== "object" || !Array.isArray(data.days)) {
      return [];
    }
    return (data.days as unknown[])
      .map(readDay)
      .filter((entry): entry is SpendDay => entry !== null)
      .sort((left, right) => (left.day < right.day ? -1 : 1))
      .slice(-MAX_DAYS);
  } catch {
    return [];
  }
}

function writeDays(storage: StorageLike, days: SpendDay[]): void {
  try {
    storage.setItem(SPEND_STORAGE_KEY, JSON.stringify(createDocument(SPEND_SCHEMA_VERSION, { days })));
  } catch {
    // A full storage must not stop a chat. The session still counts the spend.
  }
}

/** The spend of one day. A day with no record reads as zero. */
export function readSpend(storage: StorageLike, day: string = utcDay()): number {
  return readDays(storage).find((entry) => entry.day === day)?.usd ?? 0;
}

/** The last days, oldest first, with a zero for a day that used no money. */
export function readSpendHistory(
  storage: StorageLike,
  days: number = SPEND_HISTORY_DAYS,
  today: string = utcDay(),
): SpendDay[] {
  const stored = new Map(readDays(storage).map((entry) => [entry.day, entry.usd]));
  const end = Date.parse(`${today}T00:00:00.000Z`);
  const history: SpendDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = utcDay(new Date(end - offset * 86_400_000));
    history.push({ day, usd: stored.get(day) ?? 0 });
  }
  return history;
}

/** Add one cost and return the new total for the day. */
export function addSpend(storage: StorageLike, costUsd: number, day: string = utcDay()): number {
  const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const days = readDays(storage);
  const next = (days.find((entry) => entry.day === day)?.usd ?? 0) + cost;
  writeDays(
    storage,
    [...days.filter((entry) => entry.day !== day), { day, usd: next }].sort((left, right) =>
      left.day < right.day ? -1 : 1,
    ),
  );
  return next;
}
