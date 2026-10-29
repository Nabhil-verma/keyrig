import { createMemoryStorage, KeyrigError } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import {
  ACCOUNTS_STORAGE_KEY,
  listAccounts,
  normalizeUsername,
  signIn,
  signUp,
  validateUsername,
} from "../accounts";

const PASSWORD = "correct horse battery staple";
const SECRET = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

function options(storage = createMemoryStorage()) {
  return { storage, iterations: 1000, now: () => Date.parse("2026-10-17T12:00:00.000Z") };
}

async function failureOf(promise: Promise<unknown>): Promise<KeyrigError> {
  const caught = await promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(KeyrigError);
  return caught as KeyrigError;
}

describe("username rules", () => {
  it("normalizes case and surrounding spaces", () => {
    expect(normalizeUsername("  Alice_1 ")).toBe("alice_1");
    expect(validateUsername("Alice.Smith-2")).toBe("alice.smith-2");
  });

  it("accepts 3 to 32 characters", () => {
    expect(validateUsername("abc")).toBe("abc");
    expect(validateUsername("a".repeat(32))).toBe("a".repeat(32));
  });

  it("rejects short, long, spaced and leading-punctuation names", () => {
    for (const bad of ["ab", "a".repeat(33), "has space", "-leading", "emoji😀", ""]) {
      expect(() => validateUsername(bad)).toThrowError(KeyrigError);
      expect(() => validateUsername(bad)).toThrowError(/Use 3 to 32/);
    }
  });
});

describe("sign up", () => {
  it("creates the account, records it and leaves the vault unlocked", async () => {
    const storage = createMemoryStorage();
    const account = await signUp({ ...options(storage), username: "Alice", password: PASSWORD });

    expect(account.username).toBe("alice");
    expect(account.vault.isUnlocked()).toBe(true);
    expect(listAccounts(storage)).toEqual([{ username: "alice", createdAt: "2026-10-17T12:00:00.000Z" }]);
  });

  it("keeps the password and the account list free of the password text", async () => {
    const storage = createMemoryStorage();
    await signUp({ ...options(storage), username: "alice", password: PASSWORD });

    const list = storage.getItem(ACCOUNTS_STORAGE_KEY) ?? "";
    expect(list).not.toContain(PASSWORD);
    expect(list).toContain("alice");
  });

  it("refuses a username that exists in any letter case", async () => {
    const storage = createMemoryStorage();
    await signUp({ ...options(storage), username: "alice", password: PASSWORD });

    const error = await failureOf(signUp({ ...options(storage), username: "ALICE", password: PASSWORD }));
    expect(error.code).toBe("username_taken");
    expect(listAccounts(storage)).toHaveLength(1);
  });

  it("refuses a short password before it writes anything", async () => {
    const storage = createMemoryStorage();
    const error = await failureOf(signUp({ ...options(storage), username: "alice", password: "short" }));
    expect(error.code).toBe("password_too_short");
    expect(listAccounts(storage)).toEqual([]);
    expect(storage.getItem(ACCOUNTS_STORAGE_KEY)).toBeNull();
  });

  it("refuses an invalid username", async () => {
    const error = await failureOf(signUp({ ...options(), username: "ab", password: PASSWORD }));
    expect(error.code).toBe("invalid_username");
  });
});

describe("sign in", () => {
  it("returns the same vault contents after sign out and sign in", async () => {
    const storage = createMemoryStorage();
    const first = await signUp({ ...options(storage), username: "alice", password: PASSWORD });
    const view = await first.vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    first.vault.lock();

    const second = await signIn({ ...options(storage), username: "Alice", password: PASSWORD });
    expect(second.username).toBe("alice");
    expect(second.vault.getSecret(view.id)).toBe(SECRET);
  });

  it("gives the same failure for a wrong password and an unknown username", async () => {
    const storage = createMemoryStorage();
    await signUp({ ...options(storage), username: "alice", password: PASSWORD });

    const wrongPassword = await failureOf(signIn({ ...options(storage), username: "alice", password: "not the password" }));
    const unknownUser = await failureOf(signIn({ ...options(storage), username: "mallory", password: PASSWORD }));

    expect(wrongPassword.code).toBe("login_failed");
    expect(unknownUser.code).toBe("login_failed");
    expect(wrongPassword.message).toBe(unknownUser.message);
    expect(wrongPassword.category).toBe("auth");
  });
});

describe("account isolation", () => {
  it("keeps each account's keys out of the other account's vault", async () => {
    const storage = createMemoryStorage();
    const alice = await signUp({ ...options(storage), username: "alice", password: PASSWORD });
    const bob = await signUp({ ...options(storage), username: "bob", password: "bob's own password" });

    const aliceKey = await alice.vault.addKey({ label: "alice key", providerId: "openai", secret: SECRET });
    expect(bob.vault.listKeys()).toEqual([]);
    expect(bob.vault.getKeyView(aliceKey.id)).toBeUndefined();

    // Bob's password must not open Alice's vault.
    const aliceAgain = await failureOf(signIn({ ...options(storage), username: "alice", password: "bob's own password" }));
    expect(aliceAgain.code).toBe("login_failed");
  });

  it("keeps the account list free of keys and secrets", async () => {
    const storage = createMemoryStorage();
    const alice = await signUp({ ...options(storage), username: "alice", password: PASSWORD });
    await alice.vault.addKey({ label: "alice key", providerId: "openai", secret: SECRET });

    const list = storage.getItem(ACCOUNTS_STORAGE_KEY) ?? "";
    expect(list).not.toContain(SECRET);
    expect(list).not.toContain("alice key");
  });
});
