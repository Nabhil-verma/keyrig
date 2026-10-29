import { KeyrigError } from "@keyrig/shared";
import { listModels, type ModelListResult, type ProviderManifest } from "@keyrig/providers";
import type { KeyVault } from "./vault";

/**
 * PV-11: read the model list from the provider with the selected key.
 *
 * The key stays in this function and in the request header. The caller sees
 * only the model names.
 */
export interface LoadProviderModelsOptions {
  vault: KeyVault;
  manifest: ProviderManifest;
  keyId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function loadProviderModels(options: LoadProviderModelsOptions): Promise<ModelListResult> {
  const secret = options.keyId !== undefined ? options.vault.getSecret(options.keyId) : undefined;

  if (options.manifest.authType === "api-key" && secret === undefined) {
    throw KeyrigError.fromCategory("auth", {
      code: "missing_api_key",
      message: "keyrig has no key for this provider. Add a key and try again.",
    });
  }

  return listModels({
    manifest: options.manifest,
    config: {
      ...(secret !== undefined ? { apiKey: secret } : {}),
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
    },
  });
}
