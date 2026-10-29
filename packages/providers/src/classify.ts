import { KeyrigError, type ErrorCategory } from "@keyrig/shared";

/**
 * KS-06: only HTTP status 401 and 403 mean "the key failed". Do not read the
 * body text for that decision.
 *
 * ER-04: detect context overflow with the status and the text. A rate limit is
 * not an overflow. A token-per-minute error looks like an overflow but is not.
 */

const AUTH_STATUSES = new Set([401, 403]);
const CONTEXT_STATUSES = new Set([400, 413, 422]);
const TIMEOUT_STATUSES = new Set([408, 504]);

const CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bcontext\s*(?:length|window|limit)\b/i,
  /\bmaximum\s*context\b/i,
  /\b(?:input\s*)?tokens?\s+exceeds?\b/i,
  /\btoo\s*many\s*tokens?\b/i,
  /\binput\s+is\s+too\s+long\b/i,
  /\bprompt\s+is\s+too\s+long\b/i,
  /reduce\s+the\s+length\s+of\s+the\s+messages/i,
  /requested\s+input\s+length\s+.*exceeds\s+.*maximum/i,
];

/** A token-per-minute error says "tokens exceeded". Veto the overflow verdict. */
const RATE_LIMIT_PATTERNS: readonly RegExp[] = [
  /rate[\s_-]?limit/i,
  /per[\s_-]?minute\b/i,
  /\btpm\b/i,
  /\brpm\b/i,
  /requests?\s+per\s+minute/i,
];

const QUOTA_PATTERNS: readonly RegExp[] = [
  /insufficient[_\s-]?quota/i,
  /exceeded\s+your\s+current\s+quota/i,
  /\bbilling\b/i,
  /credit\s+balance/i,
  /payment\s+required/i,
];

const CONTENT_FILTER_PATTERNS: readonly RegExp[] = [
  /content[_\s-]?filter/i,
  /content\s+policy/i,
  /safety\s+system/i,
  /blocked\s+by\s+safety/i,
  /\bmoderation\b/i,
  /responsible\s+ai\s+policy/i,
];

export function hasContextOverflowSignal(text: string): boolean {
  return CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasRateLimitSignal(text: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasQuotaSignal(text: string): boolean {
  return QUOTA_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasContentFilterSignal(text: string): boolean {
  return CONTENT_FILTER_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Map an HTTP status and a body text to one category.
 * The body text only changes the result for a non-auth category.
 */
export function classifyStatus(status: number, bodyText = ""): ErrorCategory {
  if (AUTH_STATUSES.has(status)) {
    return "auth";
  }
  if (status === 402) {
    return "quota";
  }
  if (status === 429) {
    return hasQuotaSignal(bodyText) ? "quota" : "rate_limit";
  }
  if (TIMEOUT_STATUSES.has(status)) {
    return "timeout";
  }
  if (status >= 500) {
    return "server";
  }
  if (CONTEXT_STATUSES.has(status)) {
    if (hasRateLimitSignal(bodyText)) {
      return "rate_limit";
    }
    if (hasQuotaSignal(bodyText)) {
      return "quota";
    }
    if (hasContextOverflowSignal(bodyText)) {
      return "context_overflow";
    }
    if (hasContentFilterSignal(bodyText)) {
      return "content_filter";
    }
    return "invalid_request";
  }
  if (status >= 400) {
    return "invalid_request";
  }
  return "server";
}

interface ProviderErrorBody {
  error?: { code?: unknown; type?: unknown };
  code?: unknown;
  type?: unknown;
}

function readProviderCode(bodyText: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyText) as ProviderErrorBody;
    const candidate = parsed.error?.code ?? parsed.error?.type ?? parsed.code ?? parsed.type;
    if (typeof candidate === "string" && candidate.length > 0 && candidate.length <= 80) {
      return candidate;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readRetryAfterMs(response: Response | undefined): number | undefined {
  if (!response) {
    return undefined;
  }
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }
  return undefined;
}

/**
 * Build the error object for a failed HTTP response.
 * ER-03: the body text is not stored. Only a short provider code is kept.
 */
export function providerHttpError(
  status: number,
  bodyText: string,
  options: { response?: Response; secrets?: Iterable<string> } = {},
): KeyrigError {
  const category = classifyStatus(status, bodyText);
  const providerCode = readProviderCode(bodyText);
  const retryAfterMs = category === "rate_limit" ? readRetryAfterMs(options.response) : undefined;
  return KeyrigError.fromCategory(category, {
    details: {
      status,
      ...(providerCode !== undefined ? { providerCode } : {}),
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    },
    ...(options.secrets !== undefined ? { secrets: options.secrets } : {}),
  });
}

/**
 * A provider can send an error object inside a 200 stream. Classify the short
 * text, but do not store the text. The body can hold a part of the prompt.
 */
export function providerStreamError(text: string): KeyrigError {
  if (hasContentFilterSignal(text)) {
    return KeyrigError.fromCategory("content_filter");
  }
  if (hasQuotaSignal(text)) {
    return KeyrigError.fromCategory("quota");
  }
  if (hasContextOverflowSignal(text) && !hasRateLimitSignal(text)) {
    return KeyrigError.fromCategory("context_overflow");
  }
  if (hasRateLimitSignal(text)) {
    return KeyrigError.fromCategory("rate_limit");
  }
  return KeyrigError.fromCategory("server");
}

/** ER-05: the action that starts a fix for a category. */
export function remediationFor(category: ErrorCategory): string {
  return KeyrigError.fromCategory(category).remediation.action;
}

/** Classify a thrown value from fetch or from the stream reader. */
export function classifyThrown(error: unknown, secrets?: Iterable<string>): KeyrigError {
  if (error instanceof KeyrigError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return KeyrigError.fromCategory("cancelled");
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return KeyrigError.fromCategory("timeout");
  }
  const text = error instanceof Error ? `${error.name}: ${error.message}` : "";
  if (/timeout|timed out|ETIMEDOUT/i.test(text)) {
    return KeyrigError.fromCategory("timeout", { cause: error });
  }
  return KeyrigError.fromCategory("network", {
    cause: error,
    ...(secrets !== undefined ? { secrets } : {}),
  });
}
