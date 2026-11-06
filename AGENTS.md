# AGENTS.md — rules for keyrig contributors

Read this file before you change the repository. The rules apply to humans, Antigravity agents, and terminal agents (such as OpenCode).

## Core Facts
- Web app. React, TypeScript, Vite, Framer Motion.
- npm workspaces: `apps/web`, `packages/shared`, `packages/providers`, `packages/core`, `docs/`, `tools/`.
- Node 22 or newer. Dev server: `127.0.0.1:5199`. MIT license.
- No keyrig server. All data stays on device.

## Product Rules (PR-01 to PR-05)
Read `docs/PRODUCT_RULES.md`. Rules PR-01 to PR-05 are not optional.
- **PR-01 You own the keys.** Keys stay on the user device. No keyrig server stores a key.
- **PR-02 Every answer shows its source.** Show the model, the key label, the token counts, and the price state.
- **PR-03 Every request shows its cost.** If price is not known, show "unknown". Never guess a price as fact.
- **PR-04 Failures are clear and safe.** Show a clear error with one fix action. Never show a key in an error.
- **PR-05 Telemetry is off.** Do not add analytics, tracking, or remote logging.

## Writing Rules
Read `docs/STYLE.md`. Write all UI text, docs, and error text in ASD-STE100 style:
- Short sentences (20 words or fewer).
- Active voice and simple present tense.
- One word for one meaning. No idioms.
- An error message must state: what happened, and one action to fix it.

## Requirement IDs
The reference spec gives each rule an ID: `KS`, `PV`, `CO`, `ER`, `AS`, `MC`, `CX`, `AR`, `OB`, `TS`, `UX`, `BR`, `RL`.
Name the ID in the plan, commit message, and test name. Example: `KS-06 classifies auth failures by HTTP status only`.

## Layer Rules
Read `docs/ARCHITECTURE.md`.
- Hierarchy (high to low): `apps/web` -> `packages/core` -> `packages/providers` -> `packages/shared`.
- A lower layer must never import a higher layer.
- `packages/shared` imports nothing from workspace.
- `packages/providers` imports `shared` only.
- `packages/core` imports `shared` and `providers`.
- `apps/web` imports from all three packages.
- Always run `npm run check:layers` after changing imports.

## File Layout
Read `docs/MAP.md`. Put each new file in the folder naming its role:
| Folder | Holds |
|---|---|
| `apps/web/src/app/` | The shell, the router and the page host |
| `apps/web/src/app/workspace/` | One large part of the workspace screen |
| `apps/web/src/pages/` | A public page |
| `apps/web/src/pages/settings/` | One section of the settings page |
| `apps/web/src/components/` | A panel, a card or a drawer |
| `apps/web/src/components/ui/` | A brand mark or an icon |
| `apps/web/src/stores/` | A record that this browser saves |
| `apps/web/src/services/` | A call that leaves the app |
| `apps/web/src/lib/` | A pure helper |
| `apps/web/src/styles/` | A stylesheet |
| `packages/shared/src/` | The error shape, redaction and schema versions |
| `packages/providers/src/catalog/` | The model catalog, the prices and the model list |
| `packages/providers/src/manifests/` | The provider manifests and the named rules |
| `packages/providers/src/wire/` | The stream, the types and the error classification |
| `packages/providers/src/adapters/` | One wire format for each provider |
| `packages/core/src/identity/` | The accounts, the identity and the roles |
| `packages/core/src/keys/` | The key vault |
| `packages/core/src/agent/` | The agent loop, the tools, the prompt and the commit call |
| `packages/core/src/chat/` | The chat turn, the model list, the usage and the budget |

## Key Safety and Security
- Use PBKDF2-SHA256 with 600,000 iterations to derive vault keys.
- Use AES-GCM to encrypt keys with a new random IV every time.
- Never write a key, fragment, or header to `console`, logs, files, tests, exports, or errors.
- Call redaction (`redact` or `redactDeep`) before text leaves the process.
- Show warnings for local/private addresses; block cloud metadata addresses.
- Never commit a real key or add real keys to fixtures. Tests must replay recorded traffic.

## UI Design Rules
- Colors: Amber means key. Cyan means AI link. Never swap these meanings.
- Type: Inter for text; JetBrains Mono for code, keys, and numbers.
- Theme: Dark theme is default. Light theme must work. Respect `prefers-reduced-motion`.

## Decisions and Scope
- Decisions: D-01 Web first. D-02 v1 is chat, arena, artifacts. D-03 Day-one providers: OpenAI-compatible, Anthropic, Ollama. D-04 No server. D-05 MIT license. D-06 Single user.
- Not built yet: desktop app, keychain, fallback chain, model migration, budgets, artifact canvas, MCP, coding agent. Do not build these unless asked by name.

## Git Rules
- Small commits with imperative messages (e.g., `Add key label to answer card`).
- Never commit `.env` or secrets.
- Add local agent folders to `.git/info/exclude`.

## Verification (Run before finishing any task)
- Run `npm test` and `npm run check:layers`.
- If a check fails, fix the cause. Do not weaken tests.
- Report check results. Never say "done" if a check fails.

## Conflict Rule
If a request conflicts with the spec or a product rule, stop and tell the user. Do not pick one in silence.
