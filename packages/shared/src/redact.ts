/**
 * KS-03: one redaction function for every path that can carry a key.
 *
 * Call this before text goes to a log, an error report, an export, a telemetry
 * event, a tool result or a chat transcript. Do not write a second masker.
 */

export interface RedactOptions {
  /** Exact secret values to mask. Use this for keys that a pattern cannot find. */
  secrets?: Iterable<string>;
}

const REPLACEMENT = "[redacted]";

/**
 * KS-03: the provider key prefixes. This is the one table. A provider manifest
 * names its prefixes from this table, and the redactor builds its patterns from
 * it, so a new provider cannot be forgotten. `packages/providers` checks that
 * every manifest prefix appears here.
 */
export interface ProviderKeyPrefix {
  provider: string;
  prefix: string;
  /** The shortest credential body that follows the prefix. */
  minLength: number;
}

export const PROVIDER_KEY_PREFIXES: readonly ProviderKeyPrefix[] = [
  { provider: "anthropic", prefix: "sk-ant-", minLength: 20 },
  { provider: "openai", prefix: "sk-proj-", minLength: 20 },
  { provider: "openai", prefix: "sk-svcacct-", minLength: 20 },
  { provider: "openai", prefix: "sk-admin-", minLength: 20 },
  { provider: "openrouter", prefix: "sk-or-v1-", minLength: 20 },
  { provider: "openai", prefix: "sk-", minLength: 20 },
  { provider: "groq", prefix: "gsk_", minLength: 20 },
  { provider: "xai", prefix: "xai-", minLength: 20 },
  { provider: "perplexity", prefix: "pplx-", minLength: 20 },
];

/** The prefixes that a manifest declares. An empty list means no known prefix. */
export function keyPrefixesFor(provider: string): readonly string[] {
  return PROVIDER_KEY_PREFIXES.filter((entry) => entry.provider === provider).map((entry) => entry.prefix);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PREFIX_PATTERNS: readonly RegExp[] = [...PROVIDER_KEY_PREFIXES]
  // A longer prefix wins, so sk-proj- is matched before sk-.
  .sort((left, right) => right.prefix.length - left.prefix.length)
  .map(
    (entry) =>
      // The boundary stops a match in the middle of a word such as risk-assessment.
      new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(entry.prefix)}[A-Za-z0-9_-]{${entry.minLength},}`, "g"),
  );

/**
 * Shapes of keys from common providers. The patterns are anchored on the
 * provider prefix so a normal sentence is not changed.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  ...PREFIX_PATTERNS,
  /AIza[0-9A-Za-z_-]{35}/g,
  /(?<![A-Za-z0-9])gh[pous]_[A-Za-z0-9]{30,}/g,
  /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{22,}/g,
  /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,}/g,
  /(?<=Bearer\s)[A-Za-z0-9._~+/-]{8,}=*/gi,
  /(?<=[?&](?:api_key|apikey|key|token|access_token)=)[^&\s#]+/gi,
  /(?<=(?:x-api-key|x-goog-api-key)["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{8,}/gi,
];

const SENSITIVE_KEYS = /^(authorization|api[-_]?key|apikey|key|token|access[-_]?token|secret|password|passphrase|x-api-key)$/i;

function maskRegistered(text: string, secrets: Iterable<string> | undefined): string {
  if (!secrets) {
    return text;
  }
  let output = text;
  for (const secret of secrets) {
    // Only mask values long enough to be a credential. This stops a mask of "a".
    if (typeof secret !== "string" || secret.length < 6) {
      continue;
    }
    output = output.split(secret).join(REPLACEMENT);
  }
  return output;
}

/** Mask a secret in free text. Use this for logs, errors, exports and transcripts. */
export function redact(text: string, options: RedactOptions = {}): string {
  if (typeof text !== "string" || text.length === 0) {
    return text;
  }
  let output = maskRegistered(text, options.secrets);
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, REPLACEMENT);
  }
  return output;
}

/**
 * Mask every string in a value. Use this for structured data: an error detail
 * object, a usage event, an export document or a tool result.
 */
export function redactDeep<T>(value: T, options: RedactOptions = {}, seen = new WeakSet<object>()): T {
  if (typeof value === "string") {
    return redact(value, options) as unknown as T;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Error) {
    const copy = new Error(redact(value.message, options));
    copy.name = value.name;
    return copy as unknown as T;
  }
  if (seen.has(value)) {
    return "[circular]" as unknown as T;
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactDeep(item, options, seen)) as unknown as T;
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key) && typeof item === "string") {
        output[key] = REPLACEMENT;
        continue;
      }
      output[key] = redactDeep(item, options, seen);
    }
    return output as unknown as T;
  } finally {
    // A shared reference is not a cycle. Remove the mark after the branch.
    seen.delete(value);
  }
}

/**
 * KS-04: show only the last four characters. Use this next to the key label.
 * Never send the result to a log as if it were a key.
 */
export function maskSecret(secret: string, visible = 4): string {
  const text = typeof secret === "string" ? secret : "";
  if (text.length === 0) {
    return "";
  }
  const tail = text.slice(-Math.max(visible, 0));
  return `\u2026${tail}`;
}
