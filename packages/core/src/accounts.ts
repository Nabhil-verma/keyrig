import { KeyrigError, createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { KeyVault } from "./vault";

/**
 * Username and password accounts on this device.
 *
 * Each account keeps its own encrypted vault, and its password is the vault
 * passphrase. keyrig never stores the password. A wrong password simply fails
 * to decrypt the vault, so the check happens with the keys themselves.
 *
 * The account list holds only usernames and creation dates. It holds no
 * password, no hash and no key.
 */

export const ACCOUNTS_STORAGE_KEY = "keyrig.accounts.v1";
export const ACCOUNTS_SCHEMA_VERSION = 1;
export const MIN_PASSWORD_LENGTH = 8;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export interface AccountRecord {
  username: string;
  createdAt: string;
}

export interface AccountInput {
  storage: StorageLike;
  username: string;
  password: string;
  iterations?: number;
  now?: () => number;
}

export interface SignedInAccount {
  username: string;
  vault: KeyVault;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Usernames are 3 to 32 characters: letters, digits, dots, dashes and underscores. */
export function validateUsername(input: string): string {
  const username = normalizeUsername(input);
  if (!USERNAME_PATTERN.test(username)) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "invalid_username",
      message: "Use 3 to 32 letters or digits. Dots, dashes and underscores are allowed after the first character.",
      action: "check_settings",
    });
  }
  return username;
}

/** Give each account its own key namespace, so its vault cannot see another account. */
export function accountStorage(storage: StorageLike, username: string): StorageLike {
  const prefix = `keyrig.account.${validateUsername(username)}.`;
  return {
    getItem: (key) => storage.getItem(prefix + key),
    setItem: (key, value) => storage.setItem(prefix + key, value),
    removeItem: (key) => storage.removeItem(prefix + key),
  };
}

export function listAccounts(storage: StorageLike): AccountRecord[] {
  let raw: string | null;
  try {
    raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== ACCOUNTS_SCHEMA_VERSION) {
      return [];
    }
    if (!Array.isArray(parsed.data)) {
      return [];
    }
    return (parsed.data as AccountRecord[]).filter(
      (record) => record !== null && typeof record === "object" && typeof record.username === "string",
    );
  } catch {
    return [];
  }
}

function writeAccounts(storage: StorageLike, accounts: AccountRecord[]): void {
  try {
    storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(createDocument(ACCOUNTS_SCHEMA_VERSION, accounts)));
  } catch {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "storage_write_failed",
      message: "keyrig cannot save the account. The browser storage is full or blocked.",
      action: "check_settings",
    });
  }
}

function vaultFor(input: AccountInput, username: string): KeyVault {
  return new KeyVault({
    storage: accountStorage(input.storage, username),
    ...(input.iterations !== undefined ? { iterations: input.iterations } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}

/** Create the account and its empty vault. The password becomes the vault passphrase. */
export async function signUp(input: AccountInput): Promise<SignedInAccount> {
  const username = validateUsername(input.username);
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "password_too_short",
      message: `Use a password of ${MIN_PASSWORD_LENGTH} characters or more.`,
      action: "check_settings",
    });
  }
  const accounts = listAccounts(input.storage);
  if (accounts.some((account) => account.username === username)) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "username_taken",
      message: "That username is already taken on this device. Choose another.",
      action: "check_settings",
    });
  }

  const vault = vaultFor(input, username);
  await vault.create(input.password);

  const createdAt = new Date((input.now ?? Date.now)()).toISOString();
  writeAccounts(input.storage, [...accounts, { username, createdAt }]);
  return { username, vault };
}

/**
 * Unlock the account's vault with the password. Unknown usernames and wrong
 * passwords return the same message, so the form does not reveal which
 * usernames exist.
 */
export async function signIn(input: AccountInput): Promise<SignedInAccount> {
  const username = normalizeUsername(input.username);
  const failure = (): KeyrigError =>
    KeyrigError.fromCategory("auth", {
      code: "login_failed",
      message: "The username or password is not correct.",
      action: "retry",
    });

  if (!listAccounts(input.storage).some((account) => account.username === username)) {
    throw failure();
  }

  const vault = vaultFor(input, username);
  try {
    await vault.unlock(input.password);
  } catch (caught) {
    if (caught instanceof KeyrigError && (caught.code === "vault_wrong_passphrase" || caught.code === "vault_missing")) {
      throw failure();
    }
    throw caught;
  }
  return { username, vault };
}
