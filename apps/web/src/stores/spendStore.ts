import { readStoredDocument, writeStoredDocument, type StorageLike } from "@keyrig/shared";

/**
 * The money that this device spent (CO-02).
 *
 * The record keeps the last 31 UTC days, so the panel can show a week. The
 * record holds no key, no prompt and no model name.
 *
 * PR-03: a day also keeps a price state. The state is false when one request
 * of that day had no price, so a total never hides an unknown amount.
 */

const SPEND_STORAGE_KEY = "keyrig.spend.v1";
const SPEND_SCHEMA_VERSION = 3;
const MAX_DAYS = 31;

/** The days that the inspector shows. */
export const SPEND_HISTORY_DAYS = 7;

export interface SpendDay {
  day: string;
  usd: number;
  /** PR-03: false when a request of the day had no price. */
  pricingKnown: boolean;
}

/** The UTC day. The hosted model counts its limits on the same day. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** A v2 day has no price state. It counts as known, because it held priced costs. */
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
  return {
    day: record.day,
    usd: record.usd,
    pricingKnown: typeof record.pricingKnown === "boolean" ? record.pricingKnown : true,
  };
}

function parseDays(data: unknown): SpendDay[] | null {
  if (data === null || typeof data !== "object") {
    return null;
  }
  const days = (data as { days?: unknown }).days;
  if (!Array.isArray(days)) {
    return null;
  }
  return (days as unknown[])
    .map(readDay)
    .filter((entry): entry is SpendDay => entry !== null)
    .sort((left, right) => (left.day < right.day ? -1 : 1))
    .slice(-MAX_DAYS);
}

/** The saved days, oldest first. A v2 record counts as known. A v1 record is one day. */
function readDays(storage: StorageLike): SpendDay[] {
  for (const version of [SPEND_SCHEMA_VERSION, 2]) {
    const days = readStoredDocument(storage, SPEND_STORAGE_KEY, version, parseDays);
    if (days !== null) {
      return days;
    }
  }
  return (
    readStoredDocument(storage, SPEND_STORAGE_KEY, 1, (data) => {
      const day = readDay(data);
      return day === null ? null : [day];
    }) ?? []
  );
}

function writeDays(storage: StorageLike, days: SpendDay[]): void {
  try {
    writeStoredDocument(storage, SPEND_STORAGE_KEY, SPEND_SCHEMA_VERSION, { days });
  } catch {
    // A full storage must not stop a chat. The session still counts the spend.
  }
}

/** The spend of one day. A day with no record reads as zero. */
export function readSpend(storage: StorageLike, day: string = utcDay()): number {
  return readDays(storage).find((entry) => entry.day === day)?.usd ?? 0;
}

/** PR-03: false when a request of the day had no price. A day with no record is known. */
export function readSpendKnown(storage: StorageLike, day: string = utcDay()): boolean {
  return readDays(storage).find((entry) => entry.day === day)?.pricingKnown ?? true;
}

/** The last days, oldest first, with a zero for a day that used no money. */
export function readSpendHistory(
  storage: StorageLike,
  days: number = SPEND_HISTORY_DAYS,
  today: string = utcDay(),
): SpendDay[] {
  const stored = new Map(readDays(storage).map((entry) => [entry.day, entry]));
  const end = Date.parse(`${today}T00:00:00.000Z`);
  const history: SpendDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = utcDay(new Date(end - offset * 86_400_000));
    const entry = stored.get(day);
    history.push({ day, usd: entry?.usd ?? 0, pricingKnown: entry?.pricingKnown ?? true });
  }
  return history;
}

/** Add one cost and return the new total for the day. */
export function addSpend(
  storage: StorageLike,
  costUsd: number,
  day: string = utcDay(),
  pricingKnown = true,
): number {
  const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const days = readDays(storage);
  const current = days.find((entry) => entry.day === day);
  const next = (current?.usd ?? 0) + cost;
  writeDays(
    storage,
    [
      ...days.filter((entry) => entry.day !== day),
      { day, usd: next, pricingKnown: (current?.pricingKnown ?? true) && pricingKnown },
    ].sort((left, right) => (left.day < right.day ? -1 : 1)),
  );
  return next;
}
