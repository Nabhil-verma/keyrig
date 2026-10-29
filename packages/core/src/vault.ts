import { KeyrigError, createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * KS-02: in a browser, encrypt every key with WebCrypto and the user passphrase
 * before keyrig saves it. The vault never writes a plain key to storage.
 *
 * The vault holds one encrypted blob. The blob holds all key records. The app
 * unlocks the blob once for a session. The lock button drops the passphrase key.
 */

export const VAULT_STORAGE_KEY = "keyrig.vault.v1";
export const VAULT_SCHEMA_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

export interface KeyInput {
  label: string;
  providerId: string;
  secret: string;
  projectId?: string;
}

export interface KeyView {
  id: string;
  label: string;
  providerId: string;
  last4: string;
  createdAt: string;
  lastUsedAt?: string;
  projectId?: string;
}

interface KeyRecord extends KeyView {
  secret: string;
}

interface EncryptedBlob {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface VaultOptions {
  storage: StorageLike;
  iterations?: number;
  now?: () => number;
  crypto?: Crypto;
  randomId?: () => string;
}

export type VaultState = "empty" | "locked" | "unlocked";

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class KeyVault {
  readonly #storage: StorageLike;
  readonly #iterations: number;
  readonly #now: () => number;
  readonly #crypto: Crypto;
  readonly #randomId: () => string;

  #state: VaultState;
  #items: KeyRecord[] | null = null;
  #key: CryptoKey | null = null;
  #salt: Uint8Array | null = null;

  constructor(options: VaultOptions) {
    this.#storage = options.storage;
    this.#iterations = options.iterations ?? PBKDF2_ITERATIONS;
    this.#now = options.now ?? (() => Date.now());
    this.#crypto = options.crypto ?? crypto;
    this.#randomId = options.randomId ?? randomId;
    this.#state = this.#readBlob() ? "locked" : "empty";
  }

  get state(): VaultState {
    return this.#state;
  }

  isUnlocked(): boolean {
    return this.#state === "unlocked";
  }

  /**
   * The encrypted record as stored. It holds the ciphertext, the salt and the
   * IV, never a plain key. The export uses this to move a vault to a new address.
   */
  exportRecord(): string | null {
    try {
      return this.#storage.getItem(VAULT_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * True when a vault record is present, even if this build cannot read it.
   * The account layer uses this to refuse a second account for the name.
   */
  hasStoredVault(): boolean {
    try {
      return this.#storage.getItem(VAULT_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  /** Create the vault. The passphrase is not stored. */
  async create(passphrase: string): Promise<void> {
    this.#checkPassphrase(passphrase, "create");
    if (this.#state !== "empty") {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "vault_exists",
        message: "The key vault already exists. Unlock it with the passphrase.",
      });
    }
    // A record that this build cannot read is not an empty slot. Never overwrite it.
    if (this.hasStoredVault()) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "vault_corrupt",
        message: "keyrig found a key vault that it cannot read. It will not replace the vault. Keep a copy of this browser profile and ask for help.",
        action: "check_settings",
      });
    }
    this.#salt = this.#crypto.getRandomValues(new Uint8Array(16));
    this.#key = await this.#deriveKey(passphrase, this.#salt);
    this.#items = [];
    this.#state = "unlocked";
    await this.persist();
  }

  async unlock(passphrase: string): Promise<void> {
    const blob = this.#readBlob();
    if (!blob) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "vault_missing",
        message: "keyrig has no key vault. Create one with a passphrase.",
      });
    }
    const salt = fromBase64(blob.salt);
    // Read the work factor from the record, so an imported vault still opens.
    const iterations =
      typeof blob.iterations === "number" && blob.iterations >= 1_000 && blob.iterations <= 2_000_000
        ? blob.iterations
        : this.#iterations;
    const key = await this.#deriveKey(passphrase, salt, iterations);
    let plaintext: ArrayBuffer;
    try {
      plaintext = await this.#crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(fromBase64(blob.iv)) },
        key,
        toArrayBuffer(fromBase64(blob.ciphertext)),
      );
    } catch {
      throw KeyrigError.fromCategory("auth", {
        code: "vault_wrong_passphrase",
        message: "The passphrase is not correct. Try again.",
        action: "retry",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "vault_corrupt",
        message: "keyrig cannot read the key vault. The data is damaged.",
        action: "check_settings",
      });
    }
    if (!Array.isArray(parsed)) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "vault_corrupt",
        message: "keyrig cannot read the key vault. The data is damaged.",
        action: "check_settings",
      });
    }

    this.#items = (parsed as KeyRecord[]).filter(
      (item) => item !== null && typeof item === "object" && typeof item.id === "string",
    );
    this.#key = key;
    this.#salt = salt;
    this.#state = "unlocked";
  }

  lock(): void {
    this.#items = null;
    this.#key = null;
    this.#state = this.#readBlob() ? "locked" : "empty";
  }

  /** KS-04: list the key labels and the last four characters. Never list a secret. */
  listKeys(filter: { providerId?: string; projectId?: string } = {}): KeyView[] {
    return this.#requireItems()
      .filter((item) => filter.providerId === undefined || item.providerId === filter.providerId)
      .filter((item) => filter.projectId === undefined || item.projectId === filter.projectId)
      .map((item) => this.#view(item));
  }

  getKeyView(id: string): KeyView | undefined {
    const item = this.#requireItems().find((candidate) => candidate.id === id);
    return item ? this.#view(item) : undefined;
  }

  /** The caller uses the secret for one request. It never writes the secret. */
  getSecret(id: string): string | undefined {
    return this.#requireItems().find((item) => item.id === id)?.secret;
  }

  async addKey(input: KeyInput): Promise<KeyView> {
    const items = this.#requireItems();
    this.#validateInput(input);
    if (items.some((item) => item.label.trim().toLowerCase() === input.label.trim().toLowerCase())) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "duplicate_key_label",
        message: "Another key has this label. Use a different label.",
        action: "check_settings",
      });
    }
    const record: KeyRecord = {
      id: this.#randomId(),
      label: input.label.trim(),
      providerId: input.providerId,
      secret: input.secret,
      last4: input.secret.slice(-4),
      createdAt: new Date(this.#now()).toISOString(),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    items.push(record);
    await this.persist();
    return this.#view(record);
  }

  /** KS-05: replace a key without a change to open chats. The id does not change. */
  async replaceSecret(id: string, secret: string): Promise<KeyView> {
    const items = this.#requireItems();
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "key_not_found",
        message: "keyrig cannot find this key.",
        action: "check_key",
      });
    }
    if (typeof secret !== "string" || secret.trim().length < 8) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "key_too_short",
        message: "The key is too short. Paste the full key from the provider.",
        action: "check_key",
      });
    }
    item.secret = secret.trim();
    item.last4 = item.secret.slice(-4);
    await this.persist();
    return this.#view(item);
  }

  async markUsed(id: string, at: number = this.#now()): Promise<void> {
    const items = this.#requireItems();
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }
    item.lastUsedAt = new Date(at).toISOString();
    await this.persist();
  }

  async deleteKey(id: string): Promise<void> {
    const items = this.#requireItems();
    const index = items.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return;
    }
    items.splice(index, 1);
    await this.persist();
  }

  async changePassphrase(current: string, next: string): Promise<void> {
    this.#checkPassphrase(next, "change");
    const blob = this.#readBlob();
    if (!blob) {
      this.#state = "empty";
      await this.create(next);
      return;
    }
    await this.unlock(current);
    this.#salt = this.#crypto.getRandomValues(new Uint8Array(16));
    this.#key = await this.#deriveKey(next, this.#salt);
    await this.persist();
  }

  /** Encrypt the key records and write the blob. The plain data never reaches storage. */
  async persist(): Promise<void> {
    const items = this.#requireItems();
    const key = this.#key;
    const salt = this.#salt;
    if (!key || !salt) {
      throw KeyrigError.fromCategory("auth", {
        code: "vault_locked",
        message: "Unlock the key vault first.",
      });
    }
    const iv = this.#crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await this.#crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      new TextEncoder().encode(JSON.stringify(items)),
    );
    const blob: EncryptedBlob = {
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: this.#iterations,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    };
    try {
      this.#storage.setItem(VAULT_STORAGE_KEY, JSON.stringify(createDocument(VAULT_SCHEMA_VERSION, blob)));
    } catch {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "storage_write_failed",
        message: "keyrig cannot save the key vault. The browser storage is full or blocked.",
        action: "check_settings",
      });
    }
  }

  #view(item: KeyRecord): KeyView {
    return {
      id: item.id,
      label: item.label,
      providerId: item.providerId,
      last4: item.last4,
      createdAt: item.createdAt,
      ...(item.lastUsedAt !== undefined ? { lastUsedAt: item.lastUsedAt } : {}),
      ...(item.projectId !== undefined ? { projectId: item.projectId } : {}),
    };
  }

  #requireItems(): KeyRecord[] {
    if (this.#state !== "unlocked" || this.#items === null) {
      throw KeyrigError.fromCategory("auth", {
        code: "vault_locked",
        message: "Unlock the key vault first.",
      });
    }
    return this.#items;
  }

  #validateInput(input: KeyInput): void {
    if (typeof input.label !== "string" || input.label.trim().length === 0) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "missing_key_label",
        message: "Add a label for the key.",
        action: "check_settings",
      });
    }
    if (typeof input.secret !== "string" || input.secret.trim().length < 8) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "key_too_short",
        message: "The key is too short. Paste the full key from the provider.",
        action: "check_key",
      });
    }
    if (typeof input.providerId !== "string" || input.providerId.length === 0) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "missing_provider",
        message: "Choose a provider for the key.",
        action: "check_settings",
      });
    }
  }

  #checkPassphrase(passphrase: string, action: "create" | "change"): void {
    if (typeof passphrase !== "string" || passphrase.length < 8) {
      throw KeyrigError.fromCategory("invalid_request", {
        code: "passphrase_too_short",
        message:
          action === "create"
            ? "Use a passphrase of 8 characters or more."
            : "Use a new passphrase of 8 characters or more.",
        action: "check_settings",
      });
    }
  }

  async #deriveKey(passphrase: string, salt: Uint8Array, iterations: number = this.#iterations): Promise<CryptoKey> {
    const material = await this.#crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return this.#crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: toArrayBuffer(salt),
        iterations,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  #readBlob(): EncryptedBlob | null {
    let raw: string | null;
    try {
      raw = this.#storage.getItem(VAULT_STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isVersionedDocument(parsed) || parsed.schemaVersion !== VAULT_SCHEMA_VERSION) {
        return null;
      }
      const blob = parsed.data as EncryptedBlob;
      if (
        blob === null ||
        typeof blob !== "object" ||
        typeof blob.ciphertext !== "string" ||
        typeof blob.salt !== "string" ||
        typeof blob.iv !== "string"
      ) {
        return null;
      }
      return blob;
    } catch {
      return null;
    }
  }
}
