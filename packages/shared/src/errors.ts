/**
 * ER-01 and ER-02: one fixed error contract for the whole harness.
 *
 * The UI shows `message` and a button for `remediation.action`. The UI does not
 * read provider text. The category is the contract.
 */
import { redact, redactDeep, type RedactOptions } from "./redact";

export const ERROR_CATEGORIES = [
  "auth",
  "rate_limit",
  "context_overflow",
  "content_filter",
  "empty_reply",
  "network",
  "timeout",
  "server",
  "invalid_request",
  "quota",
  "cancelled",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const REMEDIATION_ACTIONS = [
  "retry",
  "wait",
  "switch_model",
  "check_key",
  "reduce_context",
  "change_prompt",
  "check_network",
  "check_settings",
  "none",
] as const;

export type RemediationAction = (typeof REMEDIATION_ACTIONS)[number];

/** ER-02: the shape that crosses the process boundary and goes to the UI. */
export interface KeyrigErrorJSON {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  remediation: { action: RemediationAction };
  details: Record<string, unknown>;
}

export interface KeyrigErrorInit {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  action: RemediationAction;
  details?: Record<string, unknown>;
  cause?: unknown;
  /** Exact secret values to mask in the message and the details (KS-03). */
  secrets?: Iterable<string>;
}

interface DefaultCopy {
  code: string;
  message: string;
  retryable: boolean;
  action: RemediationAction;
}

/** Default user text for each category. Write this text in STE style. */
export const DEFAULT_COPY: Record<ErrorCategory, DefaultCopy> = {
  auth: {
    code: "provider_auth_failed",
    message: "The provider rejected the key. Check the key and try again.",
    retryable: false,
    action: "check_key",
  },
  rate_limit: {
    code: "provider_rate_limited",
    message: "The provider is busy. Wait, then try again.",
    retryable: true,
    action: "wait",
  },
  context_overflow: {
    code: "context_overflow",
    message: "The request is larger than the context window. Remove items or make the history shorter.",
    retryable: false,
    action: "reduce_context",
  },
  content_filter: {
    code: "content_filtered",
    message: "The provider blocked the answer with a content filter. Change the prompt.",
    retryable: false,
    action: "change_prompt",
  },
  empty_reply: {
    code: "empty_reply",
    message: "The model sent an empty answer. Try again.",
    retryable: true,
    action: "retry",
  },
  network: {
    code: "network_failed",
    message: "keyrig cannot reach the provider. Check the network and the base URL.",
    retryable: true,
    action: "check_network",
  },
  timeout: {
    code: "request_timeout",
    message: "The provider took too long to answer. Try again.",
    retryable: true,
    action: "retry",
  },
  server: {
    code: "provider_error",
    message: "The provider failed. Try again in a moment.",
    retryable: true,
    action: "retry",
  },
  invalid_request: {
    code: "invalid_request",
    message: "The provider rejected the request. Check the model and the settings.",
    retryable: false,
    action: "check_settings",
  },
  quota: {
    code: "quota_exceeded",
    message: "The account has no remaining quota. Check the provider account.",
    retryable: false,
    action: "check_key",
  },
  cancelled: {
    code: "cancelled",
    message: "You stopped the request.",
    retryable: false,
    action: "none",
  },
};

export class KeyrigError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly remediation: { action: RemediationAction };
  readonly details: Record<string, unknown>;
  readonly #secrets: Iterable<string> | undefined;

  constructor(init: KeyrigErrorInit) {
    super(init.message);
    this.name = "KeyrigError";
    this.code = init.code;
    this.category = init.category;
    this.retryable = init.retryable;
    this.remediation = { action: init.action };
    this.details = init.details ?? {};
    this.#secrets = init.secrets;
    if (init.cause !== undefined) {
      // Keep the cause out of the serialized error. A cause can hold headers.
      Object.defineProperty(this, "cause", { value: init.cause, enumerable: false });
    }
  }

  static fromCategory(category: ErrorCategory, overrides: Partial<KeyrigErrorInit> = {}): KeyrigError {
    const copy = DEFAULT_COPY[category];
    return new KeyrigError({
      code: copy.code,
      category,
      message: copy.message,
      retryable: copy.retryable,
      action: copy.action,
      ...overrides,
    });
  }

  /** ER-03: mask every string before the error leaves the process. */
  toJSON(): KeyrigErrorJSON {
    const options: RedactOptions = this.#secrets ? { secrets: this.#secrets } : {};
    return {
      code: redact(this.code, options),
      category: this.category,
      message: redact(this.message, options),
      retryable: this.retryable,
      remediation: { action: this.remediation.action },
      details: redactDeep(this.details, options),
    };
  }

  /** A new error with the same contract and more detail. Never changes the category. */
  withDetails(details: Record<string, unknown>): KeyrigError {
    const init: KeyrigErrorInit = {
      code: this.code,
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      action: this.remediation.action,
      details: { ...this.details, ...details },
    };
    if (this.#secrets) {
      init.secrets = this.#secrets;
    }
    return new KeyrigError(init);
  }
}

export function isKeyrigError(value: unknown): value is KeyrigError {
  return value instanceof KeyrigError;
}

/** Convert an unknown failure to the contract. The caller must not lose a category. */
export function toKeyrigError(value: unknown, fallback: ErrorCategory = "server"): KeyrigError {
  if (isKeyrigError(value)) {
    return value;
  }
  if (value instanceof DOMException && value.name === "AbortError") {
    return KeyrigError.fromCategory("cancelled");
  }
  if (value instanceof Error) {
    return KeyrigError.fromCategory(fallback, { cause: value });
  }
  return KeyrigError.fromCategory(fallback);
}

/** A short, safe line for a log. It never holds the details object. */
export function describeError(error: unknown): string {
  const safe = isKeyrigError(error) ? error.toJSON() : toKeyrigError(error).toJSON();
  return `${safe.category}/${safe.code}: ${safe.message}`;
}
