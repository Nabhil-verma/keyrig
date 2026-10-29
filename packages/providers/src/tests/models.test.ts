import { KeyrigError } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { BUILTIN_MANIFESTS } from "../builtins";
import type { ProviderManifest } from "../manifest";
import { listModels, readModelList } from "../models";

const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai") as ProviderManifest;
const compatible = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai-compatible") as ProviderManifest;
const ollama = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "ollama") as ProviderManifest;
const freebuff = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "freebuff") as ProviderManifest;

const KEY = "sk-test-abcdefghijklmnopqrstuvwxyz012345";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("PV-11 a provider model list", () => {
  it("reads an OpenAI model list and sorts it", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      headers = init?.headers as Record<string, string>;
      return jsonResponse({ object: "list", data: [{ id: "gpt-b" }, { id: "gpt-a" }] });
    }) as typeof fetch;

    const result = await listModels({
      manifest: compatible,
      config: { apiKey: KEY, baseUrl: "http://127.0.0.1:8788/v1", fetchImpl },
    });

    expect(url).toBe("http://127.0.0.1:8788/v1/models");
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(result.models).toEqual(["gpt-a", "gpt-b"]);
    expect(result.providerId).toBe("openai-compatible");
  });

  it("reads an Ollama tag list", async () => {
    let url = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      url = String(input);
      return jsonResponse({ models: [{ name: "llama3.2:latest" }, { name: "qwen3:8b" }] });
    }) as typeof fetch;

    const result = await listModels({ manifest: ollama, config: { fetchImpl } });
    expect(url).toBe("http://127.0.0.1:11434/api/tags");
    expect(result.models).toEqual(["llama3.2:latest", "qwen3:8b"]);
  });

  it("reads both list shapes and removes duplicates", () => {
    expect(readModelList({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] })).toEqual(["a", "b"]);
    expect(readModelList({ models: [{ name: "m2" }, { model: "m1" }] })).toEqual(["m1", "m2"]);
    expect(readModelList({ models: "not a list" })).toEqual([]);
    expect(readModelList(null)).toEqual([]);
  });

  it("refuses a provider that does not list its models", async () => {
    const error = (await listModels({ manifest: openai, config: { apiKey: KEY } }).catch(
      (caught: unknown) => caught,
    )) as KeyrigError;
    expect(error.category).toBe("invalid_request");
    expect(error.code).toBe("model_list_unsupported");
  });

  it("needs a key when the provider requires one", async () => {
    const error = (await listModels({ manifest: freebuff }).catch((caught: unknown) => caught)) as KeyrigError;
    expect(error.category).toBe("auth");
    expect(error.code).toBe("missing_api_key");
  });

  it("classifies a 401 and keeps the key out of the error", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: `Incorrect key ${KEY}`, code: "invalid_api_key" } }), {
        status: 401,
      })) as typeof fetch;

    const error = (await listModels({
      manifest: compatible,
      config: { apiKey: KEY, fetchImpl },
    }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error.category).toBe("auth");
    expect(error.message).not.toContain(KEY);
    expect(JSON.stringify(error.details)).not.toContain(KEY);
  });

  it("uses the manifest hint for a blocked browser request", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const error = (await listModels({
      manifest: freebuff,
      config: { apiKey: KEY, fetchImpl },
    }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error.category).toBe("network");
    expect(error.message).toMatch(/browser origin/);
    expect(error.message).not.toContain(KEY);
  });

  it("blocks a cloud metadata base URL before the request", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({ data: [] });
    }) as typeof fetch;

    const error = (await listModels({
      manifest: compatible,
      config: { apiKey: KEY, baseUrl: "http://169.254.169.254/v1", fetchImpl },
    }).catch((caught: unknown) => caught)) as KeyrigError;

    expect(error.code).toBe("blocked_base_url");
    expect(called).toBe(false);
  });
});
