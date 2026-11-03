import { bindFetch, KeyrigError } from "@keyrig/shared";
import { checkBaseUrl, type BaseUrlCheck, type ProviderManifest } from "../manifests/manifest";
import { classifyNetworkFailure, providerHttpError } from "./classify";
import type { ProviderCallConfig } from "./types";

/** A provider error body is short. keyrig never stores the whole answer. */
const MAX_ERROR_BODY_CHARS = 8192;

/**
 * One prepared call: a checked key, a checked base URL and the two stop signals.
 * `runChat` and `listModels` both start here, so the checks cannot drift apart.
 */
export interface PreparedCall {
  apiKey: string;
  baseUrl: string;
  urlCheck: BaseUrlCheck;
  secrets: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
  signal: AbortSignal | undefined;
  aborted: () => boolean;
  timedOut: () => boolean;
}

/** KS-07: check the key and the base URL, then arm the timeout for one call. */
export function prepareCall(
  manifest: ProviderManifest,
  config: ProviderCallConfig,
  defaultTimeoutMs: number,
): PreparedCall {
  const timeoutMs = config.timeoutMs ?? defaultTimeoutMs;
  const apiKey = config.apiKey?.trim() ?? "";
  if (manifest.authType === "api-key" && apiKey.length === 0) {
    throw KeyrigError.fromCategory("auth", {
      code: "missing_api_key",
      message: "keyrig has no key for this provider. Add a key and try again.",
    });
  }

  const baseUrl = config.baseUrl?.trim() || manifest.baseUrl;
  const urlCheck = checkBaseUrl(baseUrl);
  if (!urlCheck.allowed) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "blocked_base_url",
      message: urlCheck.warning ?? "keyrig blocked the base URL.",
      details: { reason: urlCheck.reason },
    });
  }

  let timedOut = false;
  let timeoutSignal: AbortSignal | undefined;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    timeoutSignal.addEventListener("abort", () => {
      timedOut = true;
    }, { once: true });
  }
  const signal =
    config.signal && timeoutSignal ? AbortSignal.any([config.signal, timeoutSignal]) : (config.signal ?? timeoutSignal);

  return {
    apiKey,
    baseUrl,
    urlCheck,
    secrets: apiKey.length > 0 ? [apiKey] : [],
    timeoutMs,
    fetchImpl: bindFetch(config.fetchImpl),
    signal,
    aborted: () => config.signal?.aborted === true,
    timedOut: () => timedOut,
  };
}

/** Send one request. Every failure leaves as the error contract (ER-02). */
export async function fetchProvider(
  call: PreparedCall,
  manifest: ProviderManifest,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await call.fetchImpl(url, {
      ...init,
      ...(call.signal ? { signal: call.signal } : {}),
    });
  } catch (error) {
    if (call.aborted()) {
      throw KeyrigError.fromCategory("cancelled");
    }
    if (call.timedOut()) {
      throw KeyrigError.fromCategory("timeout", { details: { timeoutMs: call.timeoutMs } });
    }
    throw classifyNetworkFailure(error, {
      ...(manifest.networkHint !== undefined ? { networkHint: manifest.networkHint } : {}),
      secrets: call.secrets,
    });
  }

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
    } catch {
      bodyText = "";
    }
    throw providerHttpError(response.status, bodyText, { response, secrets: call.secrets });
  }

  return response;
}
