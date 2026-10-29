import { createMemoryStorage, createFullStorage, KeyrigError } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { KeyVault, VAULT_STORAGE_KEY } from "../vault";

const PASSPHRASE = "correct horse battery staple";
const SECRET = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

function makeVault(overrides: { now?: () => number; storage?: ReturnType<typeof createMemoryStorage> } = {}) {
  const storage = overrides.storage ?? createMemoryStorage();
  const vault = new KeyVault({
    storage,
    iterations: 1000,
    now: overrides.now ?? (() => Date.parse("2026-10-17T12:00:00.000Z")),
    randomId: () => `id-${Math.random().toString(36).slice(2, 9)}`,
  });
  return { vault, storage };
}

async function unlockedVault() {
  const context = makeVault();
  await context.vault.create(PASSPHRASE);
  return context;
}

describe("KS-02 the vault encrypts keys before it saves them", () => {
  it("starts empty and creates the vault", async () => {
    const { vault } = makeVault();
    expect(vault.state).toBe("empty");
    await vault.create(PASSPHRASE);
    expect(vault.state).toBe("unlocked");
  });

  it("does not write the secret, the label or the last four characters to storage", async () => {
    const { vault, storage } = await unlockedVault();
    await vault.addKey({ label: "personal openai", providerId: "openai", secret: SECRET });

    const raw = storage.getItem(VAULT_STORAGE_KEY) ?? "";
    expect(raw.length).toBeGreaterThan(0);
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain(SECRET.slice(-4));
    expect(raw).not.toContain("personal openai");
    expect(raw).not.toContain("openai");
    expect(raw).toContain('"schemaVersion":1');
  });

  it("unlocks with the passphrase and returns the key record", async () => {
    const { vault, storage } = await unlockedVault();
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    vault.lock();
    expect(vault.state).toBe("locked");

    const second = new KeyVault({ storage, iterations: 1000 });
    await second.unlock(PASSPHRASE);
    expect(second.listKeys()).toEqual([view]);
    expect(second.getSecret(view.id)).toBe(SECRET);
  });

  it("rejects a wrong passphrase with a clear error", async () => {
    const { vault, storage } = await unlockedVault();
    await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    vault.lock();

    const second = new KeyVault({ storage, iterations: 1000 });
    const error = (await second.unlock("the wrong passphrase").catch((caught: unknown) => caught)) as KeyrigError;
    expect(error.category).toBe("auth");
    expect(error.code).toBe("vault_wrong_passphrase");
    expect(error.remediation.action).toBe("retry");
    expect(JSON.stringify(error.toJSON())).not.toContain(SECRET);
  });

  it("does not unlock after the ciphertext changes", async () => {
    const { vault, storage } = await unlockedVault();
    await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    vault.lock();
    const raw = storage.getItem(VAULT_STORAGE_KEY) ?? "";
    storage.setItem(VAULT_STORAGE_KEY, raw.replace(/"ciphertext":"[A-Za-z0-9+/=]{8}/, '"ciphertext":"AAAAAAA'));

    const second = new KeyVault({ storage, iterations: 1000 });
    await expect(second.unlock(PASSPHRASE)).rejects.toBeInstanceOf(KeyrigError);
  });

  it("refuses a short passphrase", async () => {
    const { vault } = makeVault();
    await expect(vault.create("short")).rejects.toMatchObject({ code: "passphrase_too_short" });
  });

  it("refuses to create a second vault", async () => {
    const { vault } = await unlockedVault();
    await expect(vault.create(PASSPHRASE)).rejects.toMatchObject({ code: "vault_exists" });
  });

  it("keeps every operation locked until unlock", async () => {
    const { vault } = await unlockedVault();
    vault.lock();
    expect(() => vault.listKeys()).toThrowError(/Unlock the key vault/);
    expect(() => vault.getSecret("x")).toThrowError(/Unlock the key vault/);
  });

  it("reports a full storage instead of losing the key in silence", async () => {
    const vault = new KeyVault({ storage: createFullStorage(), iterations: 1000 });
    await expect(vault.create(PASSPHRASE)).rejects.toMatchObject({ code: "storage_write_failed" });
  });

  it("changes the passphrase and keeps the keys", async () => {
    const { vault, storage } = await unlockedVault();
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    await vault.changePassphrase(PASSPHRASE, "a new long passphrase");

    const second = new KeyVault({ storage, iterations: 1000 });
    await expect(second.unlock(PASSPHRASE)).rejects.toMatchObject({ code: "vault_wrong_passphrase" });
    await second.unlock("a new long passphrase");
    expect(second.getSecret(view.id)).toBe(SECRET);
  });
});

describe("KS-04 safe key display", () => {
  it("returns the label and the last four characters only", async () => {
    const { vault } = await unlockedVault();
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    expect(view.last4).toBe(SECRET.slice(-4));
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(Object.keys(view)).not.toContain("secret");
  });
});

describe("KS-05 key tools", () => {
  it("records the created date and the last-used date", async () => {
    let time = Date.parse("2026-10-17T12:00:00.000Z");
    const { vault } = makeVault({ now: () => time });
    await vault.create(PASSPHRASE);
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    expect(view.createdAt).toBe("2026-10-17T12:00:00.000Z");

    time += 60_000;
    await vault.markUsed(view.id);
    expect(vault.getKeyView(view.id)?.lastUsedAt).toBe("2026-10-17T12:01:00.000Z");
  });

  it("replaces a key without a change to its id", async () => {
    const { vault } = await unlockedVault();
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    const next = await vault.replaceSecret(view.id, "sk-proj-NEWKEY0123456789abcdefghijklmn");
    expect(next.id).toBe(view.id);
    expect(next.last4).toBe("klmn");
    expect(vault.getSecret(view.id)).toBe("sk-proj-NEWKEY0123456789abcdefghijklmn");
  });

  it("binds a key to a project and filters the list", async () => {
    const { vault } = await unlockedVault();
    await vault.addKey({ label: "one", providerId: "openai", secret: SECRET, projectId: "alpha" });
    await vault.addKey({ label: "two", providerId: "anthropic", secret: "sk-ant-api03-abcdefghijklmnopqrstu" });
    expect(vault.listKeys({ projectId: "alpha" }).map((key) => key.label)).toEqual(["one"]);
    expect(vault.listKeys({ providerId: "anthropic" }).map((key) => key.label)).toEqual(["two"]);
  });

  it("rejects a duplicate label", async () => {
    const { vault } = await unlockedVault();
    await vault.addKey({ label: "Work", providerId: "openai", secret: SECRET });
    await expect(
      vault.addKey({ label: "work", providerId: "openai", secret: "sk-proj-other0123456789abcdefghij" }),
    ).rejects.toMatchObject({ code: "duplicate_key_label" });
  });

  it("rejects a short key and a missing label", async () => {
    const { vault } = await unlockedVault();
    await expect(vault.addKey({ label: "x", providerId: "openai", secret: "short" })).rejects.toMatchObject({
      code: "key_too_short",
    });
    await expect(vault.addKey({ label: " ", providerId: "openai", secret: SECRET })).rejects.toMatchObject({
      code: "missing_key_label",
    });
  });

  it("deletes a key", async () => {
    const { vault } = await unlockedVault();
    const view = await vault.addKey({ label: "work", providerId: "openai", secret: SECRET });
    await vault.deleteKey(view.id);
    expect(vault.listKeys()).toEqual([]);
  });
});
