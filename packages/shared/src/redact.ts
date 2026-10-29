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
 * Shapes of keys from common providers. The patterns are anchored on the
 * provider prefix so a normal sentence is not changed.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /hf_[A-Za-z0-9]{30,}/g,
  /(?<=Bearer\s)[A-Za-z0-9._~+/-]{8,}=*/g,
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
