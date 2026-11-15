# keyrig

**keyrig is a BYOK AI harness where one key connects to many models.**

You bring your own provider keys. keyrig encrypts each key in your browser storage with WebCrypto and PBKDF2. Every response shows the model, the key label and the estimated cost. The app sends zero telemetry and requires no remote server in local mode.

---

## Contents

- [Prerequisites](#prerequisites)
- [How to run](#how-to-run)
  - [Quick start](#quick-start)
  - [Try it without a real key](#try-it-without-a-real-key)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Features](#features)
- [Modules and architecture](#modules-and-architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

---

## Prerequisites

Make sure that your system meets these requirements:

- **Node.js**: version 22 or newer
- **npm**: version 10 or newer (included with Node.js)
- **Web browser**: a modern web browser with WebCrypto support

---

## How to run

### Quick start

Follow these steps to run the web app on your local machine:

1. Clone the repository:

   ```bash
   git clone https://github.com/Nabhil-verma/keyrig.git
   cd keyrig
   ```

2. Install the workspace dependencies:

   ```bash
   npm install
   ```

3. Start the local development server:

   ```bash
   npm run dev
   ```

4. Open `http://127.0.0.1:5199` in your web browser.

5. Open `/app` to create an account on your device and set your vault password.

6. Add a provider key to send prompts to a model.

### Try it without a real key

You can test the app without a real provider key:

1. Start the local test provider server in a second terminal:

   ```bash
   npm run fake-provider
   ```

2. In the app, select the provider **OpenAI-compatible**.

3. Set the base URL to `http://127.0.0.1:8788/v1`.

4. Select a model from the list (`fake-model` or `fake-model-small`).

5. Enter any text as the key. The local server does not check the key value.

6. Send a prompt to the model.

WARNING: A key that starts with `bad-key` returns HTTP status 401. Use this key prefix to test error handling. The test server also streams slowly when a prompt contains the word `slow`.

---

## Environment variables

Local mode requires no environment variables. The app runs completely on your machine.

For optional third-party profile links, copy the example file:

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable                | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `VITE_GOOGLE_CLIENT_ID` | Optional public client ID for the Google recovery email flow.       |
| `VITE_GITHUB_CLIENT_ID` | Optional public client ID for the GitHub device authorization flow. |

WARNING: Never place a private key, a client secret or an API credential in an environment file.

---

## Commands

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm install`           | Install the workspace dependencies.                       |
| `npm run dev`           | Start the local development server on `127.0.0.1:5199`.   |
| `npm run build`         | Build the web app into `apps/web/dist`.                   |
| `npm run preview`       | Serve the production build on `127.0.0.1:5199`.           |
| `npm test`              | Run the test suite and verify package layer rules.        |
| `npm run typecheck`     | Run the TypeScript compiler and check layer rules.        |
| `npm run check:layers`  | Check that package imports follow the layer hierarchy.    |
| `npm run fake-provider` | Start the local test provider server on `127.0.0.1:8788`. |
| `npm run fake-mcp`      | Start the local test MCP server on `127.0.0.1:8789`.      |
| `npm run test:e2e`      | Run the Playwright browser tests.                         |
| `npm run lint`          | Check code with the oxlint linter.                        |
| `npm run format`        | Format repository files with Prettier.                    |

---

## Features

- **Encrypted key vault.** Protects your keys with PBKDF2 (600,000 iterations) and AES-GCM encryption in browser storage. Decrypted keys stay in memory only.
- **Multiple providers.** Connects to OpenAI, Anthropic, Ollama, LM Studio, Freebuff and any OpenAI-compatible endpoint.
- **Streaming chat.** Delivers model responses as a live text stream. The stop button retains partial text safely.
- **Model arena.** Sends one prompt to multiple models at the same time. You can compare response time, token usage and cost.
- **Provenance and cost transparency.** Displays the model name, the key label, the token usage and the estimated cost for each response.
- **Agent tools and workspace.** Executes tool calls in a sandboxed browser workspace. Displays an approval card before risky tools run.
- **MCP connectors.** Connects to external Model Context Protocol servers over SSE and HTTP transport.
- **3D scene rendering.** Renders 3D scenes with three.js when a model outputs scene data.
- **Encrypted export.** Exports the encrypted vault to a backup file that you can restore on another device.
- **Zero telemetry by default.** Sends no prompts, keys, chat history or telemetry events to a remote server.

---

## Modules and architecture

The repository uses a strict four-layer architecture. A lower layer never imports from a higher layer.

```text
apps/web  -->  packages/core  -->  packages/providers  -->  packages/shared
```

| Module / Package                           | Description                                                                                 | Layer Rule                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`packages/shared`](packages/shared)       | Contains common error contracts, schema versions and key redaction utilities.               | Imports nothing from the workspace.    |
| [`packages/providers`](packages/providers) | Contains model manifests, the pricing catalog, wire adapters and error parsers.             | Imports from `packages/shared` only.   |
| [`packages/core`](packages/core)           | Contains the key vault, identity, RBAC rules, the agent loop and chat orchestration.        | Imports from `shared` and `providers`. |
| [`apps/web`](apps/web)                     | Single-page application built with React 19, Vite, Framer Motion and custom styling tokens. | Imports from all three packages.       |
| [`tools/`](tools)                          | Contains development utilities, including mock servers and the layer boundary validator.    | Standalone Node.js scripts.            |

The script `npm run check:layers` validates the layer import rules on every test and build run.

---

## Security changes (2026-11-04)

The latest pass closed nine audited bugs (B1 to B8 and B10) and added backlog items #1 to #10. The
important changes:

- The vault keeps the PBKDF2 count that opened it, so a write can no longer lock the keys out (B1).
  `VAULT_SCHEMA_VERSION` did not change, and an old vault still opens.
- The redactor builds its key patterns from the provider manifests. Chat exports, MCP results and tool
  results pass through it (B4).
- A tool worker removes `fetch`, `XMLHttpRequest`, `WebSocket` and the other network paths from its
  global, then freezes the global (B2). A real Chromium test covers the worker and the permitted
  network path. The app ships a CSP and security headers (B3).
- A vault write checks a generation counter, and another tab signs this tab out (B8). The vault also
  locks after an idle time and after the tab stays hidden (#4).
- The backend needs `BACKEND_SESSION_SALT`, a first-owner setup token, sign-in limits and case-insensitive
  account names (B5, B6, B7, B10).
- The production app starts offline from an app-shell service worker. No API response or vault data is
  cached (PV-01).
- The first-run and vault-unlock stage shows a small 3D key and link (#10). The scene is skippable, keeps
  a still frame under reduced motion and stops while the tab is hidden.

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

---

## Testing

Run the full test suite with one command:

```bash
npm test
```

<<<<<<< HEAD
The suite runs **538 tests in 58 files**. It replays recorded provider traffic. It needs no network and
no key. It covers the vault, the providers, the core, the guard prompt, the budget, the app stores, the
tool sandbox, the backend stores and the offline shell.

- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) maps each rule to the test that proves it.
- [packages/providers/src/tests/fixtures](packages/providers/src/tests/fixtures) holds the recorded traffic.
- The browser checks in the test plan were run by hand against the local test provider.
- `e2e/two-tab.spec.ts` proves that a second tab cannot keep a stale vault.
- The offline check is a documented manual step in the test plan.

Many test names include the rule ID that they check. The test plan lists the link between each rule and its tests.

---

## Design system

- **Amber is the key.** Use amber for a saved key, a selected key and a warning.
- **Cyan is the AI link.** Use cyan for a live connection, a model and a stream.
- **Fonts.** Inter for text and JetBrains Mono for code, labels and data.
- **Motion.** Pages and cards use [Framer Motion](https://www.framer.com/motion/). The hero reacts to the pointer.
  Motion follows the `prefers-reduced-motion` setting. Animations turn off for users who ask for less motion.
- **Themes.** Dark is the default. Light is one click away. Both themes use the same tokens.

The brand mark is a key head with a central hub and three nodes. The mark is in
[apps/web/public/brand](apps/web/public/brand).

---

## Deploy the web app

Build the app. The output goes to `apps/web/dist`.
=======
The test suite runs with Vitest. It replays recorded provider traffic fixtures from [`packages/providers/src/tests/fixtures`](packages/providers/src/tests/fixtures). The unit tests require no network connection and no real key.

To run additional test checks:
>>>>>>> cf6fcbb4f90e5e284de2c4fe66a9268c4a8e467e

```bash
# Verify TypeScript types and package layer rules
npm run typecheck

# Run browser end-to-end tests
npm run test:e2e
```

See [docs/TEST_PLAN.md](docs/TEST_PLAN.md) for the complete list of requirement rules and tests.

---

## Contributing

Read [AGENTS.md](AGENTS.md) before you edit files in this repository.

Follow these contribution guidelines:

1. Write all user interface text, documentation and error strings in ASD-STE100 style (see [docs/STYLE.md](docs/STYLE.md)).
2. Use short sentences, the active voice and terms from [docs/GLOSSARY.md](docs/GLOSSARY.md).
3. Include the requirement rule ID in test names and commit messages (example: `KS-06 classifies auth failures by HTTP status only`).
4. Follow the layer import rules. Run `npm run check:layers` to confirm.
5. Never commit a real key or write an unredacted secret to a log or test fixture.
6. Run `npm test` and `npm run typecheck` to confirm your changes pass all checks.

---

## Documentation

| Document                                       | Contents                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| [docs/MAP.md](docs/MAP.md)                     | File map showing directory layout and file responsibilities.            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | Layer hierarchy, request dispatch flow and key encryption architecture. |
| [docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md) | The five core product rules (PR-01 through PR-05).                      |
| [docs/SECURITY.md](docs/SECURITY.md)           | Local device boundaries and backend security model.                     |
| [docs/STYLE.md](docs/STYLE.md)                 | ASD-STE100 writing rules for documentation and user interface text.     |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)           | Product terminology definitions and restricted terms.                   |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md)         | Mapping between specification requirements and automated test files.    |
| [docs/RBAC.md](docs/RBAC.md)                   | Role definitions and client-side permission checks.                     |
| [docs/AGENT_TOOLS.md](docs/AGENT_TOOLS.md)     | Agent capabilities, risk classifications and sandboxed operations.      |
| [docs/CONNECTIONS.md](docs/CONNECTIONS.md)     | Google account recovery and GitHub device-flow integration.             |
| [docs/DECISIONS.md](docs/DECISIONS.md)         | Architecture decision records and product rationale.                    |
| [docs/INSPIRED_BY.md](docs/INSPIRED_BY.md)     | Open-source inspirations for keyrig.                                    |

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
