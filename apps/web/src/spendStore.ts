import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * The money that this device spent today (CO-02).
 *
 * The record holds one day and one number. A new day starts at zero, so the
 * file stays small and needs no pruning. The record holds no key, no prompt
 * and no model name.
 */

export const SPEND_STORAGE_KEY = "keyrig.spend.v1";
export const SPEND_SCHEMA_VERSION = 1;

export interface DaySpend {
  day: string;
  usd: number;
}

/** The UTC day. The hosted model counts its limits on the same day. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function readRecord(storage: StorageLike): DaySpend | null {
  let raw: string | null;
  try {
    raw = storage.getItem(SPEND_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== SPEND_SCHEMA_VERSION) {
      return null;
    }
    const record = parsed.data as Partial<DaySpend> | null;
    if (record === null || typeof record !== "object") {
      return null;
    }
    if (typeof record.day !== "string" || typeof record.usd !== "number") {
      return null;
    }
    if (!Number.isFinite(record.usd) || record.usd < 0) {
      return null;
    }
    return { day: record.day, usd: record.usd };
  } catch {
    return null;
  }
}

/** The spend for one day. A record for another day reads as zero. */
export function readSpend(storage: StorageLike, day: string = utcDay()): number {
  const record = readRecord(storage);
  if (record === null || record.day !== day) {
    return 0;
  }
  return record.usd;
}

export function writeSpend(storage: StorageLike, usd: number, day: string = utcDay()): void {
  const safe = Number.isFinite(usd) && usd > 0 ? usd : 0;
  try {
    storage.setItem(SPEND_STORAGE_KEY, JSON.stringify(createDocument(SPEND_SCHEMA_VERSION, { day, usd: safe })));
  } catch {
    // A full storage must not stop a chat. The session still counts the spend.
  }
}

/** Add one cost and return the new total for the day. */
export function addSpend(storage: StorageLike, costUsd: number, day: string = utcDay()): number {
  const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const next = readSpend(storage, day) + cost;
  writeSpend(storage, next, day);
  return next;
}
