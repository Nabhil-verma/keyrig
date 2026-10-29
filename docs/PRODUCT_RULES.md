# Product rules

These rules come from section 1.1 of the reference spec. They are not optional.

## PR-01. The user owns the keys.

The keyrig server MUST NOT see a key unless the user turns on a server feature and agrees.

keyrig has no server in v1. The browser encrypts each key with the user passphrase before it saves
the key. The key is decrypted in memory for one request only.

## PR-02. Every answer shows its source.

The user MUST always see which model and which key label made each answer.

## PR-03. Every request shows its cost.

The user MUST always see the estimated cost of a request.

The app marks a cost as estimated. The app shows the price source and the price date.

## PR-04. Failures are clear and safe.

The harness MUST fail in a clear and safe way. It MUST NOT fail in silence.

Each failure carries one category, one short message and one fix action. See `packages/shared/src/errors.ts`.

## PR-05. Telemetry is off by default.

All telemetry MUST be off by default. There is no telemetry code in v1. When a tracing feature
arrives, it is opt-in and it passes through the redaction function first.
