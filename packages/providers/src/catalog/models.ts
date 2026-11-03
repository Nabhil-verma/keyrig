import { KeyrigError } from "@keyrig/shared";
import { joinUrl, type ProviderManifest } from "../manifests/manifest";
import { fetchProvider, prepareCall } from "../wire/request";
import type { ProviderCallConfig } from "../wire/types";

/**
 * PV-11: read the model list from the provider when its manifest allows it.
 * The list is a convenience. A provider without a list keeps the typed name.
 */

export const MODEL_LIST_TIMEOUT_MS = 15_000;
export const MODEL_LIST_LIMIT = 500;

export interface ModelListOptions {
  manifest: ProviderManifest;
  config?: Pick<ProviderCallConfig, "apiKey" | "baseUrl" | "fetchImpl" | "signal" | "timeoutMs" | "headers">;
}

export interface ModelListResult {
  models: string[];
  providerId: string;
}

const ANTHROPIC_VERSION = "2023-06-01";

function listUrl(manifest: ProviderManifest, baseUrl: string): string {
  return joinUrl(baseUrl, manifest.wireFormat === "ollama-chat" ? "api/tags" : "models");
}

function listHeaders(manifest: ProviderManifest, apiKey: string): Record<string, string> {
  if (manifest.wireFormat === "anthropic-messages") {
    return {
      accept: "application/json",
      ...(apiKey.length > 0 ? { "x-api-key": apiKey } : {}),
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }
  return {
    accept: "application/json",
    ...(apiKey.length > 0 ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

function modelIdOf(item: unknown): string | null {
  if (typeof item === "string") {
    return item.length > 0 ? item : null;
  }
  if (item === null || typeof item !== "object") {
    return null;
  }
  const record = item as { id?: unknown; name?: unknown; model?: unknown };
  for (const value of [record.id, record.name, record.model]) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

/** Read the ids from an OpenAI, Anthropic or Ollama list body. */
export function readModelList(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  const record = payload as { data?: unknown; models?: unknown };
  const list = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : [];
  const ids = new Set<string>();
  for (const item of list) {
    const id = modelIdOf(item);
    if (id !== null) {
      ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right)).slice(0, MODEL_LIST_LIMIT);
}

export async function listModels(options: ModelListOptions): Promise<ModelListResult> {
  const { manifest } = options;
  const config = options.config ?? {};

  if (!manifest.abilities.modelList) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "model_list_unsupported",
      message: "This provider does not list its models. Type the model name.",
    });
  }

  const call = prepareCall(manifest, config, MODEL_LIST_TIMEOUT_MS);
  const response = await fetchProvider(call, manifest, listUrl(manifest, call.baseUrl), {
    method: "GET",
    headers: { ...listHeaders(manifest, call.apiKey), ...(config.headers ?? {}) },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw KeyrigError.fromCategory("server", {
      code: "model_list_unreadable",
      message: "The provider sent a model list in an unknown format. Type the model name.",
    });
  }

  return { models: readModelList(payload), providerId: manifest.id };
}
