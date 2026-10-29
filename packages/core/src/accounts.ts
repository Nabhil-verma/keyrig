import { KeyrigError, createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { KeyVault, VAULT_STORAGE_KEY } from "./vault";

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
export const VAULT_EXPORT_KIND = "keyrig.vault-export";
export const VAULT_EXPORT_VERSION = 1;
/** A vault is small. A large file is not one of ours. */
export const MAX_VAULT_IMPORT_BYTES = 2 * 1024 * 1024;

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

/** The file that moves an encrypted vault to another browser or address. */
export interface VaultExportFile {
  kind: typeof VAULT_EXPORT_KIND;
  version: typeof VAULT_EXPORT_VERSION;
  username: string;
  exportedAt: string;
  vault: unknown;
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

function isVaultExport(value: unknown): value is VaultExportFile {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== VAULT_EXPORT_KIND || record.version !== VAULT_EXPORT_VERSION) {
    return false;
  }
  if (typeof record.username !== "string" || typeof record.exportedAt !== "string") {
    return false;
  }
  if (!isVersionedDocument(record.vault) || record.vault.schemaVersion !== 1) {
    return false;
  }
  return record.vault.data !== null && typeof record.vault.data === "object" && !Array.isArray(record.vault.data);
}

/**
 * Build the export file. It holds the encrypted record, the username and a
 * date. It holds no secret and no password. A wrong password cannot open it.
 */
export function createVaultExport(input: { username: string; vault: KeyVault; now?: () => number }): VaultExportFile {
  const record = input.vault.exportRecord();
  if (record === null) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "vault_missing",
      message: "There is no key vault to export.",
      action: "check_settings",
    });
  }
  let vault: unknown;
  try {
    vault = JSON.parse(record);
  } catch {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "vault_corrupt",
      message: "keyrig cannot read the key vault. The data is damaged.",
      action: "check_settings",
    });
  }
  return {
    kind: VAULT_EXPORT_KIND,
    version: VAULT_EXPORT_VERSION,
    username: validateUsername(input.username),
    exportedAt: new Date((input.now ?? Date.now)()).toISOString(),
    vault,
  };
}

/**
 * Import a vault from another address. The password must open the vault before
 * keyrig writes the account record. An existing account is never replaced.
 */
export async function importVault(input: {
  storage: StorageLike;
  file: unknown;
  password: string;
  iterations?: number;
  now?: () => number;
}): Promise<SignedInAccount> {
  const invalid = (): KeyrigError =>
    KeyrigError.fromCategory("invalid_request", {
      code: "import_invalid",
      message: "That file is not a keyrig vault export.",
      action: "check_settings",
    });
  const failure = (): KeyrigError =>
    KeyrigError.fromCategory("auth", {
      code: "login_failed",
      message: "The username or password is not correct.",
      action: "retry",
    });

  if (!isVaultExport(input.file)) {
    throw invalid();
  }
  let username: string;
  try {
    username = validateUsername(input.file.username);
  } catch {
    throw invalid();
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw failure();
  }

  const accounts = listAccounts(input.storage);
  const vault = vaultFor(
    {
      storage: input.storage,
      username,
      password: input.password,
      ...(input.iterations !== undefined ? { iterations: input.iterations } : {}),
      ...(input.now !== undefined ? { now: input.now } : {}),
    },
    username,
  );
  if (accounts.some((account) => account.username === username) || vault.hasStoredVault()) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "account_exists",
      message: `This device already has an account named ${username}. Sign in to it, or clear this site's data first.`,
      action: "check_settings",
    });
  }

  const store = accountStorage(input.storage, username);
  const removeRecord = (): void => {
    try {
      store.removeItem(VAULT_STORAGE_KEY);
    } catch {
      // The rollback is best effort. The error that caused it is more useful.
    }
  };

  try {
    store.setItem(VAULT_STORAGE_KEY, JSON.stringify(input.file.vault));
  } catch {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "storage_write_failed",
      message: "keyrig cannot save the account. The browser storage is full or blocked.",
      action: "check_settings",
    });
  }

  try {
    await vault.unlock(input.password);
  } catch (caught) {
    removeRecord();
    if (
      caught instanceof KeyrigError &&
      (caught.code === "vault_wrong_passphrase" || caught.code === "vault_missing" || caught.code === "vault_corrupt")
    ) {
      throw failure();
    }
    throw caught;
  }

  try {
    writeAccounts(input.storage, [
      ...accounts,
      { username, createdAt: new Date((input.now ?? Date.now)()).toISOString() },
    ]);
  } catch (caught) {
    removeRecord();
    throw caught;
  }

  return { username, vault };
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
  const taken = (): KeyrigError =>
    KeyrigError.fromCategory("invalid_request", {
      code: "username_taken",
      message: "That username is already in use on this device. Sign in, or choose another username.",
      action: "check_settings",
    });
  if (accounts.some((account) => account.username === username)) {
    throw taken();
  }

  // A vault can outlive a lost account record. Its name still belongs to it.
  const vault = vaultFor(input, username);
  if (vault.hasStoredVault()) {
    throw taken();
  }
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
