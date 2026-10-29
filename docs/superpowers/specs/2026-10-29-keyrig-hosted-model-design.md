# keyrig hosted model: design

2026-10-29. Owner decision: the optional model runs behind keyrig's existing Worker.

## Intent and why

keyrig assumes the visitor brings a key. That is the point, and it is also the reason a
visitor with no key cannot see the product work. This design adds one optional provider
that runs on keyrig's own Worker, so a visitor can send one prompt without a key.

The owner accepted the cost and the abuse risk on 2026-10-29. The BYOK path stays the
default. The hosted card is never chosen for a new chat.

## Goals

- One more provider in the picker, named **keyrig hosted**, with three open models.
- The route lives in `sites-preview/worker.mjs`, so there is one deploy target.
- Hard caps that bound the daily spend, even when someone calls the route directly.
- The owner's Cloudflare API token never appears in the client bundle or the repository.
- A clear error when the route is not configured. Never an uncapped fallback.

## Non-goals

- No accounts, no sign-in gate, no per-user billing, no usage dashboard.
- No images, tools, reasoning, or a model beyond the three below.
- No change to the BYOK providers, the vault, or the arena.

## Anti-goals

- A request that runs without a cap because the database is missing.
- A token or an account id in `apps/web`.
- A hosted answer that shows a made-up cost.
- The hosted card preselected on a new chat.

## Approaches

| # | Approach | Trade |
|---|---|---|
| A | A small AI Worker on the owner's Cloudflare account | Keeps the token off the public site, needs a second deploy target and CORS. |
| B | A route inside keyrig's existing Worker | One deploy, same origin, no CORS. The public Worker holds the token. **Chosen.** |
| C | No hosted model | Keeps D-04 intact, leaves the gap this design closes. |

B was chosen because the owner wanted one host and accepted the token risk. A was
rejected for the extra deploy. C was rejected because the owner asked for the model.

## Constraint found before writing this

The Sites deployer attaches assets, D1 and R2. It never attaches a Workers AI binding.
The route therefore calls the Workers AI REST API with `fetch`, not `env.AI`.

Both keyrig environments report `auth: null`. The first build had no sign-in step, and the
caps were the only ceiling. The owner then asked for a gate. The route now takes one
owner-issued access code at `/hosted`, exchanged for a signed HttpOnly cookie. The caps
still bound the spend. The gate is one shared code, not per-person identity.

## The route

| Path | Method | Behaviour |
|---|---|---|
| `/hosted` | GET | The unlock page. Shows whether this browser is signed in. |
| `/hosted` | POST | Checks the code, then sets the signed cookie and redirects to `/app`. |
| `/api/ai/v1/models` | GET | The three models in the OpenAI list shape, or 503 when unconfigured. |
| `/api/ai/v1/chat/completions` | POST | Checks the cookie, then the caps, then forwards an OpenAI-shaped body to Workers AI and returns its stream. |

Forward target: `https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/v1/chat/completions`
with `Authorization: Bearer {CF_AI_TOKEN}`. That endpoint takes a `model` field and
answers in the OpenAI shape, so the client keeps the existing `openai-chat` wire format.
No new wire format, no new rule, no new parser. Usage is requested with
`stream_options: { include_usage: true }`; if Cloudflare omits it, the answer shows
`price unknown`, because keyrig does not invent token counts.

## Models and the allowlist

The Worker rejects any model that is not in this list. The list is server-side.

| Model id | Label | $/M in | $/M out |
|---|---|---:|---:|
| `@cf/meta/llama-3.1-8b-instruct-fp8` | Llama 3.1 8B | 0.152 | 0.287 |
| `@cf/openai/gpt-oss-20b` | gpt-oss 20B | 0.20 | 0.30 |
| `@cf/qwen/qwen3-30b-a3b-fp8` | Qwen3 30B | 0.0509 | 0.335 |

The exact ids are checked against the live account at deploy time. Cloudflare has
deprecated some `-fast` variants, so a dead id is replaced, not guessed.

## Caps

Stored in D1. The day is UTC. Three counters per request: install, address, site.

| Scope | Key | Limit per day |
|---|---|---|
| Visitor | the random id inside the signed cookie | 30 requests |
| Address | SHA-256 of `CF-Connecting-IP` with a salt | 120 requests |
| Site | one row | 500 requests |

The cookie is `HttpOnly`, `SameSite=Lax`, and lasts 30 days. Its value is
`id.expires.HMAC`, so a visitor cannot mint an id and cannot skip the code. A wrong code
is refused with 401 and no cookie is set.

- `max_tokens` is clamped to 700. At 500 requests a day the worst case is 350,000 output
  tokens, about $0.11 on gpt-oss 20B and $0.27 on Qwen3 30B. That is the spend ceiling.
- A body over 40 messages or 32,000 characters is rejected with 413.
- A missing `DB` binding, or a failed write, returns 503. The route never runs uncapped.
- `429` carries `Retry-After`. keyrig already renders a rate limit with a wait note.

## Configuration

| Name | Kind | Where |
|---|---|---|
| `CF_ACCOUNT_ID` | var | Sites → Secrets |
| `CF_AI_TOKEN` | secret | Sites → Secrets, scope Workers AI Read + Edit |
| `HOSTED_IP_SALT` | secret | Sites → Secrets. It keys the cookie signature as well as the address hash |
| `HOSTED_ACCESS_CODE` | secret | Sites → Secrets. At least 8 characters; 36 random characters is better |

The owner creates the token in the Cloudflare dashboard and puts it in a local file. The
file is passed to the deploy tool and never read into the chat or the repository.
`.secrets/` joins `.gitignore`.

The token can spend money on the owner's account. Rotating it is a one-step secret change.

## Files

| File | Change |
|---|---|
| `sites-preview/hosted.mjs` | New. Allowlist, clamps, quota math, request builder. Pure and testable. |
| `sites-preview/hosted.test.mjs` | New. Unit tests for the above. |
| `sites-preview/worker.mjs` | Two routes before the asset fallback. |
| `sites-preview/manifest.json` | The `DB` binding, if the deploy needs it declared. |
| `packages/providers/src/builtins.ts` | One manifest, `keyrig-hosted`, `openai-chat`, `priceSource: "none"`. |
| `apps/web/src/styles.css` | The card note: keyrig pays, the prompt leaves the browser. |
| `docs/DECISIONS.md` | D-04 corrected in place. |
| `docs/TEST_PLAN.md` | The new checks. |

## Copy

- Provider: **keyrig hosted**
- Card note: "keyrig pays for this model. The prompt goes to keyrig's Worker, then to
  Cloudflare. It is the one provider that does not run from your browser."
- Unconfigured: "The hosted model is not set up on this site."

## Tests

- The allowlist rejects an unknown model and accepts the three.
- The clamp cuts `max_tokens` to 700 and rejects a body over the size limit.
- The quota counts three scopes and returns the narrower remaining value.
- A missing binding returns a 503 code, not a pass-through.
- The manifest parses and has a unique id.
- A session round-trips, and an altered, expired or foreign session is refused.
- A wrong code is refused; the right code sets the cookie; the cookie opens the route.
- Manual, on the deployed origin: one live answer, then the caps with a small limit.

## What this changes in the product

D-04 said "no server". The correct version is "no server, except the optional hosted
model, which runs only when the visitor picks it." PR-01 ("the repository has no server
code") becomes false and is corrected too. This is the cost of the feature, and the owner
accepted it.

## Risks

- The token sits in a public Worker. A bug that echoes it, or a leak, spends the owner's
  money. Scope and rotation are the mitigation.
- The address cap is bypassable with a proxy pool. The site cap is the real ceiling.
- The code is shared, so a leak opens the route to anyone who has it. Rotation is one
  secret change, and rotating it signs every browser out.
- Workers AI may omit usage, so hosted cost reads as unknown. That is accurate, not a bug.
- The token needs Workers AI on the owner's plan. That is unverified until the deploy.
