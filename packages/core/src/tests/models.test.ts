import { KeyrigError } from "@keyrig/shared";
import { BUILTIN_MANIFESTS, type ProviderManifest } from "@keyrig/providers";
import { describe, expect, it } from "vitest";
import { KeyVault } from "../vault";
import { loadProviderModels } from "../models";

const PASSPHRASE = "correct horse battery";
const SECRET = "sk-local-test-abcdefghijklmnop";
const compatible = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai-compatible") as ProviderManifest;
const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai") as ProviderManifest;

async function unlockedVault() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const vault = new KeyVault({ storage, iterations: 1000 });
  await vault.create(PASSPHRASE);
  const key = await vault.addKey({ label: "local", providerId: compatible.id, secret: SECRET });
  return { vault, key };
}

describe("PV-11 the core reads the model list with the selected key", () => {
  it("sends the vault key and returns the model names", async () => {
    const { vault, key } = await unlockedVault();
    let url = "";
    let authorization = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      authorization = (init?.headers as Record<string, string>).authorization ?? "";
      return new Response(JSON.stringify({ data: [{ id: "gpt-a" }, { id: "gpt-b" }] }), { status: 200 });
    }) as typeof fetch;

    const result = await loadProviderModels({
      vault,
      manifest: compatible,
      keyId: key.id,
      baseUrl: "http://127.0.0.1:8788/v1",
      fetchImpl,
    });

    expect(url).toBe("http://127.0.0.1:8788/v1/models");
    expect(authorization).toBe(`Bearer ${SECRET}`);
    expect(result.models).toEqual(["gpt-a", "gpt-b"]);
  });

  it("fails with auth when the provider needs a key and none is selected", async () => {
    const { vault } = await unlockedVault();
    const error = (await loadProviderModels({ vault, manifest: openai }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;

    expect(error.category).toBe("auth");
    expect(error.code).toBe("missing_api_key");
  });

  it("keeps the key out of a failed list request", async () => {
    const { vault, key } = await unlockedVault();
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: `Incorrect key ${SECRET}`, code: "invalid_api_key" } }), {
        status: 401,
      })) as typeof fetch;

    const error = (await loadProviderModels({
      vault,
      manifest: compatible,
      keyId: key.id,
      baseUrl: "http://127.0.0.1:8788/v1",
      fetchImpl,
    }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error.category).toBe("auth");
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error.details)).not.toContain(SECRET);
  });
});
