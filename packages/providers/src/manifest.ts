/**
 * PV-02: one manifest for each provider. Provider quirks live here or in one
 * named rule. They do not live in the UI and they do not live in the agent loop.
 */

export type AuthType = "api-key" | "none" | "api-key-optional";

export type WireFormat = "openai-chat" | "anthropic-messages" | "ollama-chat";

export type ReasoningFormat = "openai-reasoning" | "anthropic-thinking" | "ollama-think" | "none";

export interface ProviderAbilities {
  streaming: boolean;
  tools: boolean;
  images: boolean;
  reasoning: boolean;
  promptCache: boolean;
  modelList: boolean;
}

export interface ProviderManifest {
  id: string;
  displayName: string;
  authType: AuthType;
  baseUrl: string;
  defaultModel: string;
  envVars: readonly string[];
  abilities: ProviderAbilities;
  wireFormat: WireFormat;
  reasoningFormat: ReasoningFormat;
  docsUrl: string;
  /** True for a provider that a user can point at a custom URL (PV-05). */
  supportsCustomBaseUrl: boolean;
  /** The key of the pricing source. "models.dev" means the model catalog. */
  priceSource: string;
  /** PV-02: the wire field for the output limit. The value is a provider quirk. */
  maxTokensField: "max_tokens" | "max_completion_tokens";
  /**
   * An optional message for a network failure that never got an HTTP response.
   * Example: a hosted API that does not allow the browser origin (CORS).
   */
  networkHint?: string;
}

export function getManifest(
  manifests: readonly ProviderManifest[],
  id: string,
): ProviderManifest | undefined {
  return manifests.find((manifest) => manifest.id === id);
}

/** KS-08: the standard environment variable for a provider. */
export function envVarFor(manifest: ProviderManifest): string | undefined {
  return manifest.envVars[0];
}

/**
 * KS-07: check a custom base URL before the app uses it.
 *
 * The check blocks cloud metadata addresses. It warns about a local or private
 * address, but it allows the address, because Ollama and LM Studio need it.
 */
export interface BaseUrlCheck {
  allowed: boolean;
  warning: string | null;
  reason: "ok" | "blocked-metadata" | "invalid-url" | "insecure-remote";
}

const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.goog",
  "100.100.100.200",
  "fd00:ec2::254",
]);

const PRIVATE_V4 =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$|localhost$)/i;

function isPrivateHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name.endsWith(".localhost") || name === "::1") {
    return true;
  }
  return PRIVATE_V4.test(name);
}

export function checkBaseUrl(rawUrl: string, options: { requireHttps?: boolean } = {}): BaseUrlCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, warning: "The base URL is not a valid URL.", reason: "invalid-url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      allowed: false,
      warning: "The base URL must start with http:// or https://.",
      reason: "invalid-url",
    };
  }

  if (METADATA_HOSTS.has(url.hostname.toLowerCase())) {
    return {
      allowed: false,
      warning: "The base URL points to a cloud metadata address. keyrig blocks this address.",
      reason: "blocked-metadata",
    };
  }

  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
    return {
      allowed: false,
      warning: "The base URL uses http on a public host. Use https, or use a local address.",
      reason: "insecure-remote",
    };
  }

  if (isPrivateHost(url.hostname)) {
    return {
      allowed: true,
      warning: "The base URL points to a local or private address. Make sure you trust this server.",
      reason: "ok",
    };
  }

  if (options.requireHttps === true && url.protocol !== "https:") {
    return { allowed: false, warning: "The base URL must use https.", reason: "insecure-remote" };
  }

  return { allowed: true, warning: null, reason: "ok" };
}

/** Join a base URL and a path without a double slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
