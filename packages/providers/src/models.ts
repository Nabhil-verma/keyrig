import { KeyrigError } from "@keyrig/shared";
import { classifyNetworkFailure, providerHttpError } from "./classify";
import { checkBaseUrl, joinUrl, type ProviderManifest } from "./manifest";
import type { ProviderCallConfig } from "./types";

/**
 * PV-11: read the model list from the provider when its manifest allows it.
 *
 * The list is a convenience. A provider that does not list its models keeps
 * the typed model name. The key is used for this request only.
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
  if (manifest.wireFormat === "ollama-chat") {
    return joinUrl(baseUrl, "api/tags");
  }
  return joinUrl(baseUrl, "models");
}

function listHeaders(manifest: ProviderManifest, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (manifest.wireFormat === "anthropic-messages") {
    if (apiKey.length > 0) {
      headers["x-api-key"] = apiKey;
    }
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    return headers;
  }
  if (apiKey.length > 0) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
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
  const seen = new Set<string>();
  for (const item of list) {
    const id = modelIdOf(item);
    if (id !== null) {
      seen.add(id);
    }
  }
  return [...seen].sort((left, right) => left.localeCompare(right)).slice(0, MODEL_LIST_LIMIT);
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

  const apiKey = config.apiKey?.trim() ?? "";
  if (manifest.authType === "api-key" && apiKey.length === 0) {
    throw KeyrigError.fromCategory("auth", {
      code: "missing_api_key",
      message: "keyrig has no key for this provider. Add a key and try again.",
    });
  }

  const baseUrl = config.baseUrl && config.baseUrl.trim().length > 0 ? config.baseUrl.trim() : manifest.baseUrl;
  const urlCheck = checkBaseUrl(baseUrl);
  if (!urlCheck.allowed) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "blocked_base_url",
      message: urlCheck.warning ?? "keyrig blocked the base URL.",
      details: { reason: urlCheck.reason },
    });
  }

  const secrets = apiKey.length > 0 ? [apiKey] : [];
  const timeoutMs = config.timeoutMs ?? MODEL_LIST_TIMEOUT_MS;
  let timedOut = false;
  let timeoutSignal: AbortSignal | undefined;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    timeoutSignal.addEventListener("abort", () => {
      timedOut = true;
    }, { once: true });
  }
  const signal =
    config.signal && timeoutSignal
      ? AbortSignal.any([config.signal, timeoutSignal])
      : (config.signal ?? timeoutSignal);

  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(listUrl(manifest, baseUrl), {
      method: "GET",
      headers: { ...listHeaders(manifest, apiKey), ...(config.headers ?? {}) },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (config.signal?.aborted === true) {
      throw KeyrigError.fromCategory("cancelled");
    }
    if (timedOut) {
      throw KeyrigError.fromCategory("timeout", { details: { timeoutMs } });
    }
    throw classifyNetworkFailure(error, {
      ...(manifest.networkHint !== undefined ? { networkHint: manifest.networkHint } : {}),
      secrets,
    });
  }

  if (!response.ok) {
    let body = "";
    try {
      body = (await response.text()).slice(0, 4096);
    } catch {
      body = "";
    }
    throw providerHttpError(response.status, body, { response, secrets });
  }

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
