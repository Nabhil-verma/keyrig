# keyrig

**keyrig is a BYOK AI harness. One key connects to many AI models.**

You bring your own provider keys. keyrig stores them encrypted in your browser. Each prompt goes to the
model that you choose. Every answer shows its model, its key label and its estimated cost.

There is no keyrig server in this version. Telemetry is off.

---

## Contents

- [Status](#status)
- [Features](#features)
- [The web app](#the-web-app)
- [Quick start](#quick-start)
- [Try it without a real key](#try-it-without-a-real-key)
- [Commands](#commands)
- [Project layout](#project-layout)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Testing](#testing)
- [Design system](#design-system)
- [Deploy the web app](#deploy-the-web-app)
- [Not built yet](#not-built-yet)
- [Contributing](#contributing)
- [License](#license)

---

## Status

Phase 1 is complete. It covers the safe core: the key vault, the provider manifests, the chat path,
the error classes and the recorded-traffic tests.

Phase 2 has a first web app. It covers keys, chat with provenance, the cost estimate, the model arena
and a set of public pages.

The artifact canvas and the coding agent are not built yet.

---

## Features

- **Encrypted key vault.** Your password opens the vault. The app encrypts each key before it saves the key.
- **Six built-in providers.** OpenAI, Anthropic, Freebuff, Ollama, LM Studio and any OpenAI-compatible server.
  Freebuff needs a CORS header on its API before a browser can call it. The app shows a clear message until then.
- **Streaming chat.** Answers stream in. Stop keeps the partial text and marks the answer as partial or aborted.
- **Model picker.** A provider that lists its models fills the picker. You can reload the list, or type a name that the list does not have.
- **MCP connectors.** Add a tool server in Settings, scan its tools, allow the ones you trust and run them.
  keyrig sends the arguments and reads the text. It sends no key.
- **Provenance on every answer.** Each answer shows the model, the key label, the token counts and the price state.
- **Cost estimate.** Catalog prices turn into an estimated cost. A price that keyrig does not know shows as unknown.
- **Model arena.** Send one prompt to several models at once. Compare time, cost and answer. Continue with the answer you choose.
- **Clear errors.** Each error shows a category, a short message and one fix action, such as "Open keys" or "Try again".
- **Local models.** Ollama and LM Studio work with a local address. keyrig warns you about local and private addresses.
- **Blocked addresses.** keyrig blocks cloud metadata addresses as a custom base URL.
- **Light and dark themes.** The theme follows your choice and stays in this browser.
- **Lock on sign-out.** Sign-out locks the vault. It drops the decrypted keys from memory and stops any stream.
- **Roles.** The first account on the device is the owner. An owner or an admin grants a role. Each protected
  feature checks a permission key, not a role name. See [docs/RBAC.md](docs/RBAC.md).

---

## The web app

The web app has four pages. Unknown paths show a not-found page.

| Path | Page | What it shows |
|---|---|---|
| `/` | Home | The product, the routing visual, the features, the steps and a call to action. |
| `/providers` | Providers | Each built-in provider, its auth type, its wire format, its base URL and its abilities. |
| `/security` | Security | The product rules and the key vault rules. |
| `/app` | Workspace | Sign-in, the key vault, the route (model and key), chat and the arena. |

The workspace stays loaded while you read the public pages. Your session and your chat stay in memory.
Sign-out clears them.

---

## Quick start

Requirements:

- Node.js 22 or newer.
- npm, which comes with Node.js.

Steps:

1. Install the dependencies.

   ```bash
   npm install
   ```

2. Run the tests. The tests need no real key and no network.

   ```bash
   npm test
   ```

3. Start the web app.

   ```bash
   npm run dev
   ```

4. Open `http://127.0.0.1:5199` in your browser.
5. Open `/app`. Create an account on this device. Your username and password open the vault.
6. Add a provider key. The app encrypts the key before it saves the key.

---

## Try it without a real key

Use the local test provider to send prompts without a real key.

1. Start the local test provider in a second terminal.

   ```bash
   npm run fake-provider
   ```

2. In the app, choose the provider **OpenAI-compatible**.
3. Set the base URL to `http://127.0.0.1:8788/v1`.
4. Pick the model from the list. The local server lists `fake-model` and `fake-model-small`.
5. Add any key. The local server does not check the key.
6. Send a prompt.

WARNING: A key that starts with `bad-key` gets status 401. Use it to test the auth error path.
The local server also streams slowly for a prompt that contains the word `slow`. Use it to test Stop.

---

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install the workspace dependencies. |
| `npm run dev` | Start the web app on `127.0.0.1:5199`. |
| `npm test` | Run every test file and the layer check. |
| `npm run typecheck` | Type check the repository and run the layer check. |
| `npm run check:layers` | Check that no package imports a layer above it. |
| `npm run build` | Build the web app into `apps/web/dist`. |
| `npm run fake-provider` | Start the local test provider on `127.0.0.1:8788`. |
| `npm run fake-mcp` | Start the local MCP test server on `127.0.0.1:8789`. |
| `npm run test:e2e` | Run the Playwright browser tests against the two local test servers. |

---

## Project layout

```text
keyrig code/
├── apps/
│   └── web/                   The browser app (React, Vite, Framer Motion)
│       └── src/
│           ├── Site.tsx       Routes, page transitions and the scroll progress bar
│           ├── router.tsx     A small history router and the Link component
│           ├── SiteChrome.tsx The shared header and footer
│           ├── pages/         Home, providers and security pages
│           ├── App.tsx        The workspace: sign-in, keys, route, chat and arena
│           ├── ChatPanel.tsx  Messages, provenance chips and the composer
│           └── styles.css     The design system and the page styles
├── packages/
│   ├── shared/                Error contract, redaction and schema versions
│   ├── providers/             Manifests, catalog, cost, errors and wire formats
│   └── core/                  Key vault, keyring, usage bus and chat orchestration
├── docs/                      Architecture, product rules, style, glossary and test plan
└── tools/                     The layer check and the fake provider
```

---

## Architecture

keyrig uses four layers. A lower layer never imports a higher layer.

```text
apps/web  ->  core  ->  providers  ->  shared
```

| Layer | Owns | Must not |
|---|---|---|
| `shared` | The error shape, redaction and schema versions. | Import a workspace package. |
| `providers` | Manifests, the catalog, cost, error classes and wire formats. | Import `core` or an app. |
| `core` | The key vault, the keyring, the usage bus and chat orchestration. | Import an app. |
| `apps/*` | Screens and user input. | Write settings files directly. |

`npm run check:layers` reads every import. It fails on an import that goes up a layer.

### The request path

Each request goes through three steps:

1. **Intent.** A neutral request, for example a chat with streaming and a message list.
2. **Named rule.** The rule comes from the provider manifest.
3. **Wire format.** One adapter sends the request in the provider format.

A new provider needs one manifest and one rule. It does not change `core`.

### The key path

```text
password --PBKDF2-SHA256 (600,000 iterations)--> key --AES-GCM--> encrypted vault in browser storage
```

- The vault holds one encrypted blob. The blob holds the key records.
- The decrypted keys live in memory while the vault is unlocked.
- Sign-out locks the vault and drops the decrypted keys.

---

## Security model

These product rules are not optional. The app follows them. The full text is in
[docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md).

| Rule | Meaning |
|---|---|
| PR-01 | You own the keys. The keyrig server does not see a key. This version has no keyrig server. |
| PR-02 | Every answer shows its source: the model and the key label. |
| PR-03 | Every request shows its cost. An unknown price shows as unknown. |
| PR-04 | Failures are clear and safe. The app does not fail in silence. |
| PR-05 | Telemetry is off by default. There is no telemetry code in this version. |

What keyrig does not do:

- It does not recover a forgotten password. Keep a copy of your password in a safe place.
- It does not send a key to any endpoint except the one that you choose.
- It does not put a key, a key fragment or a request header in a log, an error or a chat message.
- It does not guard a role with a server. The role records stay in this browser, so the checks stop mistakes,
  not the device owner.

---

## Testing

Run the full suite with one command.

```bash
npm test
```

The suite has 144 tests in 12 files. It replays recorded provider traffic. It needs no network and no key.

- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) maps each rule to the test that proves it.
- [packages/providers/src/tests/fixtures](packages/providers/src/tests/fixtures) holds the recorded traffic.
- The browser checks in the test plan were run by hand against the local test provider.

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

```bash
npm run build
```

The app uses browser routing for `/providers`, `/security` and `/app`. Your host must serve
`index.html` for these paths. Without that rule, a direct visit to a path returns 404.

The repository has the rule for three hosts:

- **Netlify and Cloudflare Pages.** `apps/web/public/_redirects` is copied into `dist`.
- **Vercel.** `apps/web/vercel.json` rewrites every path to `index.html`. Set the project root to
  `apps/web`.

The static files keep their own paths. The rule applies only to paths without a file.

WARNING: Serve the app over HTTPS in production. The vault uses WebCrypto, and browsers allow it only in
a secure context. The localhost address counts as secure. Other plain HTTP addresses do not.

---

## Not built yet

- The desktop app and the OS keychain (KS-01).
- Provider profiles, the fallback chain and model migration (PV-04, PV-06, PV-10).
- Budgets and run limits (CO-02, CO-03).
- The artifact canvas, checkpoints, approvals and the coding agent (Phase 3 and 4).
- The `doctor` command and the CLI (KS-08, KS-09).

---

## Contributing

Read [AGENTS.md](AGENTS.md) before you change the repository. It covers the product rules, the writing style,
the layer rules and the test rules.

Short version:

1. Write UI text, docs and error text in the style of [docs/STYLE.md](docs/STYLE.md).
2. Name the rule ID in the test name and in the commit message, for example `KS-06 classifies auth failures by HTTP status only`.
3. Never write a key to a log, a file, a test, an export or a chat.
4. Run `npm test` and `npm run typecheck` before you report a change as complete.

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, the request path and the key path. |
| [docs/PRODUCT_RULES.md](docs/PRODUCT_RULES.md) | The product rules PR-01 to PR-05. |
| [docs/STYLE.md](docs/STYLE.md) | The writing style for all keyrig text. |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | The words that keyrig uses for each meaning. |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Each rule and the test that proves it. |
| [docs/RBAC.md](docs/RBAC.md) | The permission keys, the roles and the rules. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions and their reasons. |
| [docs/INSPIRED_BY.md](docs/INSPIRED_BY.md) | The projects that inspired keyrig. |

---

## License

MIT. See [LICENSE](LICENSE).
