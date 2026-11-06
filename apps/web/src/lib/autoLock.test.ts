import { describe, expect, it } from "vitest";
import { normalizeAutoLockMinutes, shouldAutoLock } from "./autoLock";

const base = {
  now: 1_000_000,
  lastActivity: 1_000_000,
  hiddenAt: null,
  autoLockMinutes: 15,
  lockOnHiddenMinutes: 5,
};

describe("B8 backlog #4 auto-lock", () => {
  it("keeps the vault open before the idle limit", () => {
    expect(shouldAutoLock({ ...base, now: base.lastActivity + 14 * 60_000 })).toBe(false);
  });

  it("locks at the idle limit", () => {
    expect(shouldAutoLock({ ...base, now: base.lastActivity + 15 * 60_000 })).toBe(true);
  });

  it("locks a hidden tab after the hidden limit", () => {
    expect(shouldAutoLock({ ...base, hiddenAt: base.now - 5 * 60_000 })).toBe(true);
    expect(shouldAutoLock({ ...base, hiddenAt: base.now - 4 * 60_000 })).toBe(false);
  });

  it("turns each lock off with null", () => {
    expect(shouldAutoLock({ ...base, autoLockMinutes: null, now: base.lastActivity + 999 * 60_000 })).toBe(false);
    expect(
      shouldAutoLock({ ...base, lockOnHiddenMinutes: null, hiddenAt: base.now - 999 * 60_000 }),
    ).toBe(false);
  });

  it("keeps only a whole number in the safe range", () => {
    expect(normalizeAutoLockMinutes(30, 15)).toBe(30);
    expect(normalizeAutoLockMinutes(null, 15)).toBeNull();
    expect(normalizeAutoLockMinutes(0, 15)).toBe(15);
    expect(normalizeAutoLockMinutes(241, 15)).toBe(15);
    expect(normalizeAutoLockMinutes(1.5, 15)).toBe(15);
  });
});
