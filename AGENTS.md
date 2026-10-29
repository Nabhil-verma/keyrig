# AGENTS.md — rules for keyrig contributors

Read this file before you change the repository. The rules apply to humans and to AI agents.

## Product rules

Read [docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md). The rules PR-01 to PR-05 are not optional.

## Writing rules

Read [docs/STYLE.md](docs/STYLE.md). Write all UI text, docs and error text in ASD-STE100 style.
Use short sentences. Use the active voice. Use one word for one meaning.

## Requirement IDs

The reference spec gives each rule an ID: KS, PV, CO, ER, AS, MC, CX, AR, OB, TS, UX, BR, RL.
Name the ID in the plan, the commit message and the test name.

Example: `KS-06 classifies auth failures by HTTP status only`.

## Layers

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- `packages/shared` imports nothing from the workspace.
- `packages/providers` imports `shared` only.
- `packages/core` imports `shared` and `providers`.
- `apps/web` imports the three packages.

Run `npm run check:layers` after you add an import across packages.

## Key safety

- Do not write a key, a key fragment or a request header to a log, a file, a test, an export, a chat message or a telemetry event.
- Call the redaction function (`redact` or `redactDeep`) before any text leaves the process.
- Do not commit a real key. Do not add a real key to a test fixture.
- Recorded provider traffic MUST be redacted before you save it.

## Provider changes

Read [packages/providers/README.md](packages/providers/README.md).

- Add provider quirks to a manifest or to a named rule. Do not add them to the UI or to the agent loop.
- Do not build a hand-made model table. Read the catalog.

## Verification

- Run `npm test` and `npm run typecheck` before you report a change as complete.
- Run the test that proves the rule you changed.
- If a test fails, fix the cause. Do not weaken the test.

## Conflict rule

If a request conflicts with the spec or with a product rule, tell the user. Do not pick one in silence.
