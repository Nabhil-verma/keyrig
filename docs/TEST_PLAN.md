# Test plan

The tests need no key and no network. Run `npm test`.

## Safety

| Rule | Test |
|---|---|
| KS-02 the vault encrypts keys before storage | `packages/core/src/tests/vault.test.ts`: "does not write the secret, the label or the last four characters to storage" |
| KS-02 a wrong passphrase fails clearly | `vault.test.ts`: "rejects a wrong passphrase with a clear error" |
| KS-02 damaged data does not unlock | `vault.test.ts`: "does not unlock after the ciphertext changes" |
| KS-03 one redaction function | `packages/shared/src/tests/redact-and-errors.test.ts`: "masks a key in each sink representation" |
| KS-04 show the label and the last four characters | `redact-and-errors.test.ts`: "shows only the last four characters"; `vault.test.ts`: "returns the label and the last four characters only" |
| KS-05 replace a key without a new id | `vault.test.ts`: "replaces a key without a change to its id" |
| KS-05 last-used date | `vault.test.ts`: "records the created date and the last-used date" |
| KS-06 auth uses status 401 and 403 only | `packages/providers/src/tests/classify.test.ts`: "does not treat a 400 that quotes the word unauthorized as auth" |
| KS-06 a 401 in the call path | `stream.test.ts`: "classifies status 401 as auth and keeps the sent key out of the error" |
| KS-07 warn about a custom base URL | `manifest.test.ts`: "allows a local address and gives a warning"; `stream.test.ts`: "adds a warning for a local base URL" |
| KS-07 block cloud metadata | `manifest.test.ts`: "blocks a cloud metadata address"; `stream.test.ts`: "blocks a metadata address before the request" |

## Errors

| Rule | Test |
|---|---|
| ER-01 the fixed category list | `redact-and-errors.test.ts`: "gives every category a default copy" |
| ER-02 one error shape | `redact-and-errors.test.ts`: "has one shape with a code, a category, a message, retryable, an action and details" |
| ER-03 no key in the error path | `redact-and-errors.test.ts`: "masks a key in the message and in every detail value" |
| ER-04 overflow yes, rate limit no | `classify.test.ts`: "does not treat a token-per-minute limit as an overflow" |
| ER-05 one fix action for each category | `classify.test.ts`: "gives a rate limit a wait action and a visible wait time" |
| ER-05 overflow starts a shorter context | `stream.test.ts`: "classifies context overflow and starts the reduce-context fix" |

## Providers

| Rule | Test |
|---|---|
| PV-01 the catalog parses prices and limits | `catalog.test.ts`: "reads model ids, prices, limits and abilities" |
| PV-01 offline start with the cache | `catalog.test.ts`: "starts with a stale cache when the network is off" |
| PV-01 starter catalog when the cache is empty | `catalog.test.ts`: "starts with the bundled catalog when there is no cache and no network" |
| PV-02 manifest fields | `manifest.test.ts`: "has every required field and a unique id" |
| PV-03 intent, rule, wire format | `rules.test.ts`: "builds the OpenAI plan with a named rule" |
| PV-03 a new provider needs one rule | `rules.test.ts`: "adds a provider with one rule and no core change" |
| PV-05 local and custom endpoints | `manifest.test.ts`: "has the three day-one providers and the local types" |
| PV-07 image conversion | `rules.test.ts`: "converts an image for OpenAI", "for Anthropic", "for Ollama" |
| PV-08 partial text is kept | `stream.test.ts`: "keeps the partial text and marks the result aborted when the user stops" |
| PV-08 a broken stream is partial | `stream.test.ts`: "marks a broken stream as partial and does not retry it" |
| PV-09 retry one empty reply | `packages/core/src/tests/chat.test.ts`: "retries one empty reply and then succeeds" |
| PV-09 no retry after a tool | `chat.test.ts`: "does not retry a turn that already ran a tool" |

## Cost and usage

| Rule | Test |
|---|---|
| CO-01 cost parts | `cost.test.ts`: "adds the input, cached and output parts" |
| CO-01 unknown price is marked | `cost.test.ts`: "marks a missing price as unknown"; `chat.test.ts`: "marks an unknown price instead of a number" |
| CO-04 one usage event for each call | `chat.test.ts`: "returns the text, the cost, the key label and one usage event" |
| CO-04 the event holds no key | `chat.test.ts`: "does not put a key in the usage event" |

## Architecture and tests

| Rule | Test |
|---|---|
| AR-01 layer order | `npm run check:layers` |
| AR-03 one-time migration | `packages/shared/src/tests/schema.test.ts`: "does not run a migration twice" |
| TS-01 recorded provider traffic | `stream.test.ts`: the three replay tests |
| TS-03 negative cases | `classify.test.ts` and `stream.test.ts` |
| TS-04 no prompt or path in the error | `stream.test.ts`: "does not put the prompt or a file path in the error text" |

## Browser checks (manual, 2026-10-17)

The web app ran against a local OpenAI-compatible test server (`npm run fake-provider`).

- KS-02: `localStorage` held one encrypted blob. It did not hold the key, the label or the last four
  characters.
- PR-02 and PR-03: each answer showed the model, the key label and the price state.
- PV-08: Stop kept the partial text and marked the answer "aborted".
- KS-06: a 401 showed the auth error with the "Open keys" action.
- UX-01: the arena sent one prompt to two models and showed time, cost and answer for each.
- PV-01: a reload started from the cached catalog with the network off.
