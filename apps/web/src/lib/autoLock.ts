/**
 * B8 backlog #4: decide when this tab locks the key vault.
 *
 * The rule is pure, so the test needs no timer and no browser. The workspace
 * calls it on a timer and when the tab becomes visible again.
 */

export interface AutoLockInput {
  now: number;
  /** The last pointer or key activity. */
  lastActivity: number;
  /** When the tab became hidden, or null when it is visible. */
  hiddenAt: number | null;
  /** Minutes of no activity. null turns the idle lock off. */
  autoLockMinutes: number | null;
  /** Minutes that the tab stays hidden. null turns the hidden lock off. */
  lockOnHiddenMinutes: number | null;
}

export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 240;

export function shouldAutoLock(input: AutoLockInput): boolean {
  if (
    input.hiddenAt !== null &&
    input.lockOnHiddenMinutes !== null &&
    input.now - input.hiddenAt >= input.lockOnHiddenMinutes * 60_000
  ) {
    return true;
  }
  return (
    input.autoLockMinutes !== null &&
    input.now - input.lastActivity >= input.autoLockMinutes * 60_000
  );
}

/** Keep a stored choice only when it is a whole number in the safe range. */
export function normalizeAutoLockMinutes(value: unknown, fallback: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }
  if (value < MIN_AUTO_LOCK_MINUTES || value > MAX_AUTO_LOCK_MINUTES) {
    return fallback;
  }
  return value;
}
