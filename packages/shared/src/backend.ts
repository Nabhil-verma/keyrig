/**
 * D-07: keyrig has an optional backend on freebuff. It is used only for
 * accounts, roles, the marketplace and feature requests. Local mode stays
 * complete and works offline. The default is local mode.
 *
 * PR-01 and PR-05: a request to the backend carries only the four fields below.
 * The backend never receives a key, a chat, a prompt, cost data, usage data or
 * a streak. This module is the one place that builds a backend request.
 */
import { redact, redactDeep } from "./redact";

/** The only fields that a request to the backend can carry. */
export const BACKEND_FIELDS = ["account", "publishedTools", "featureRequests", "votes"] as const;

export type BackendField = (typeof BACKEND_FIELDS)[number];

export type BackendRequest = Partial<Record<BackendField, unknown>>;

/** True when the text holds a key-like string, because the redaction changed it. */
export function holdsKey(text: string): boolean {
  return redact(text) !== text;
}

/**
 * Build a request for the backend.
 *
 * The function keeps the four allowed fields and drops every other field. It
 * drops an allowed field too when that field holds a key-like string, so the
 * item is not sent. A key name inside an allowed field is masked (KS-03).
 */
export function backendRequest(input: Record<string, unknown> = {}): BackendRequest {
  const output: BackendRequest = {};
  for (const field of BACKEND_FIELDS) {
    const value = input[field];
    if (value === undefined) {
      continue;
    }
    if (holdsKey(String(JSON.stringify(value) ?? ""))) {
      continue;
    }
    output[field] = redactDeep(value);
  }
  return output;
}
