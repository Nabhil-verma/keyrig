# Architecture

This document follows rule AR-01.

## Layers

```text
apps/web  ->  core  ->  providers  ->  shared
     \__________\_________/
```

| Layer | Owns | MUST NOT |
|---|---|---|
| `shared` | Error contract, redaction, schema versions | Import a workspace package |
| `providers` | Manifests, catalog, cost, error classification, wire formats | Import `core` or an app |
| `core` | Key vault, keyring, usage bus, chat orchestration | Import an app |
| `apps/*` | Screens and user input | Write settings files directly (AR-04) |

`node tools/check-layers.mjs` reads every import and fails on an upward import.

## Data path (PV-03)

Each request goes through three steps. Do not merge the steps.

```text
request intent  ->  named rule  ->  provider wire format
```

- The **intent** is neutral. Example: `{ kind: "chat", stream: true, messages, maxTokens }`.
- The **named rule** comes from the provider manifest. Example: `openai-chat.stream`.
- The **wire format** is one adapter. Example: `providers/src/adapters/openai.ts`.

A new provider adds one manifest and one adapter. It does not change `core`.

## Error path

1. The adapter reads the HTTP status and a bounded part of the response body.
2. `providers/src/classify.ts` maps the status and the text to one category (KS-06, ER-04).
3. `shared/src/errors.ts` builds the error object (ER-02).
4. The UI shows the message and the fix action (ER-05).

Only status 401 and 403 mean "the key failed". The classification code does not read words such as
"unauthorized" for that decision.

## Key path

```text
passphrase --PBKDF2--> key --AES-GCM--> ciphertext in browser storage
```

- The vault holds one encrypted blob. The blob holds the key records.
- The vault keeps the passphrase key in memory for one session. The lock button drops the key.
- There is no server. See PR-01.
