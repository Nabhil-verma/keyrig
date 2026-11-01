# File map

This document tells you where each file is and what it does. Read it before you
search the repository.

The rule for a new file: use the folder that names the role of the file. Do not
add a new file to the top of a `src` folder.

## The repository

```text
keyrig code/
├── apps/
│   └── web/                    The browser app (React, Vite, Framer Motion)
│       ├── public/             Brand files, fonts and the manifest
│       ├── index.html          The HTML shell. It loads src/app/main.tsx
│       └── src/                The app code. See "The web app" below.
├── packages/
│   ├── shared/                 Error contract, redaction and schema versions
│   ├── providers/              Manifests, catalog, cost, errors and wire formats
│   └── core/                   Key vault, accounts, roles, tools and chat
├── docs/                       Architecture, this map, product rules and tests
├── e2e/                        The Playwright browser tests
└── tools/                      The layer check and the two local test servers
```

The layers go in one direction. A lower layer does not import a higher layer.

```text
apps/web  ->  core  ->  providers  ->  shared
```

`node tools/check-layers.mjs` reads each import. It fails on an import that goes
up a layer. See [ARCHITECTURE.md](ARCHITECTURE.md).

## The web app (apps/web/src)

Each folder has one role. Each test file sits next to the file that it tests.

```text
src/
├── vite-env.d.ts
├── app/            The shell: the entry point, the routes and the page host
├── pages/          The four public pages
├── components/     The workspace panels, cards and the ui/ primitives
├── stores/         Saved state in this browser
├── services/       Calls that leave the app
├── lib/            Pure helpers with no saved state
└── styles/         The design system and the workspace styles
```

### app/

| File | What it does |
|---|---|
| `main.tsx` | The Vite entry. It applies the saved theme, then mounts `Site`. |
| `Site.tsx` | The route host. It loads a page, keeps the workspace mounted and shows the scroll bar. |
| `SiteChrome.tsx` | The shared header and footer of the public pages. |
| `router.tsx` | The history router: the `Route` type, `useRoute`, `navigate` and `Link`. |
| `WorkspaceScreen.tsx` | The `/app` workspace. It holds the state and the chat turns. |

### app/workspace/

The workspace screen keeps each large part of its layout in one file here.

| File | What it does |
|---|---|
| `WorkspaceHeader.tsx` | The top bar: the brand, the view tabs, the cost and the sign-out button. |
| `ThreadRail.tsx` | The left rail: the saved chats, the budget meter and the setup links. |
| `RoutePopover.tsx` | The route popover with the profile panel. |
| `Inspector.tsx` | The right column: the outbound facts, the files and the tool record. |
| `SignedOutStage.tsx` | The stage before sign-in. |
| `useChatTurns.ts` | The chat turns: one answer, one agent turn and the arena run. |
| `chatTurnHelpers.ts` | The error shape helper and the sent-text filter. |

### pages/

| File | What it does |
|---|---|
| `HomePage.tsx` | The landing page: the product, the routing visual and the call to action. |
| `ProvidersPage.tsx` | The six built-in providers and their abilities. |
| `SecurityPage.tsx` | The product rules and the vault rules. |
| `SettingsPage.tsx` | `/settings`: the page shell and the section list. |
| `settings/` | One file for each settings section, with `Section.tsx` as the wrapper. |

### components/

Each component shows one part of the workspace.

| File | What it does |
|---|---|
| `ApprovalDialog.tsx` | The approval card (AS-01) that comes before a risky tool call. |
| `ArenaPanel.tsx` | The model arena (UX-01). One prompt goes to many models. |
| `AuthPanel.tsx` | Sign-in, sign-up and the vault export and import. |
| `ChatPanel.tsx` | The message list, the provenance chips and the composer. |
| `ConnectionsPanel.tsx` | The Google recovery address and the GitHub device link. |
| `ErrorCard.tsx` | The error card (ER-02) with one fix action. |
| `KeyPanel.tsx` | The key vault panel: add, test, replace and export a key. |
| `ModelPicker.tsx` | The model list, the reload button and the custom name. |
| `OutboundPanel.tsx` | The inspector: what leaves the device and the spend of the day. |
| `ProfilePanel.tsx` | The profile: provider, model, key, base URL and budget. |
| `RolesPanel.tsx` | The role list and the role assignment. |
| `SceneView.tsx` | The three.js renderer for a `KeyrigScene`. It loads on demand. |
| `Shelf.tsx` | The setup drawer with the keys, the profile and the roles. |
| `ToolTrace.tsx` | The record of the tool calls under one answer. |
| `WorkspacePanel.tsx` | The browser workspace: the file list and the editor. |

### components/ui/

| File | What it does |
|---|---|
| `Icon.tsx` | The icon set and the `IconName` type. |
| `BrandMark.tsx` | The key mark with the hub and the three nodes. |
| `BrandLockup.tsx` | The mark and the wordmark together. |

### stores/

Each store saves one record in this browser. Each record has a schema version
(AR-03). Each store has a test file next to it.

| File | What it saves |
|---|---|
| `settings.ts` | The theme and the motion choice. It is also the `useSettings` hook. |
| `toolSettings.ts` | The agent tool switches and the risk acknowledgement. |
| `routeStore.ts` | The route: the provider, the model and the key for each mode. |
| `connections.ts` | The account links: the recovery address, the GitHub repository and the commit rule. |
| `connectors.ts` | The MCP servers that the user added. |
| `oauthConfig.ts` | The two public OAuth client ids, from the environment or from the user. |
| `skills.ts` | The saved skills for the `/` shortcut. |
| `threads.ts` | The saved chats. |
| `workspace.ts` | The files of the browser workspace, with the path guard (AS-02). |
| `spendStore.ts` | The spend of the current UTC day (CO-02). |

### services/

These files talk to something outside the app. They hold no React code.

| File | What it does |
|---|---|
| `agentRun.ts` | One agent turn: send the request, read the tools, ask for approval, repeat. |
| `mcp.ts` | The MCP client: list the tools and call one tool. |
| `oauth.ts` | The Google ID token and the GitHub device flow. |

### lib/

These files are pure helpers. They save nothing and they render nothing.

| File | What it does |
|---|---|
| `composerTokens.ts` | Parse `@` and `/` in the composer and add a file to the prompt (CX-04). |
| `deltaBuffer.ts` | Join the stream deltas into one render for each frame (PV-08). |
| `modelOptions.ts` | Merge the provider list and the catalog into the picker list (PV-11). |
| `motion.ts` | The shared motion variants and the ease-out curve. |
| `theme.ts` | Read and apply the theme. |
| `pendingPrompt.ts` | Hand one prompt from the settings page to the composer. |
| `storage.ts` | Check `localStorage` and fall back to memory storage. |
| `types.ts` | The `UIMessage` and `ArenaResult` types and `newId`. |

### styles/

| File | What it does |
|---|---|
| `styles.css` | The design tokens, the components and the public page styles. |
| `workspace.css` | The styles of the `/app` workspace. |

## The packages

### packages/shared

`shared` holds the code that every other layer uses. It imports no workspace
package.

| File | What it does |
|---|---|
| `errors.ts` | The error categories, the remediation actions and the error shape (ER-01, ER-02). |
| `redact.ts` | The one redaction function for a key (KS-03). |
| `schema.ts` | The versioned document and the migration step (AR-03). |
| `storage.ts` | The `StorageLike` type and the memory storage fallback. |

### packages/providers

| File | What it does |
|---|---|
| `manifests/manifest.ts` | The manifest types: auth type, wire format and reasoning format. |
| `manifests/builtins.ts` | The six built-in provider manifests (PV-02). |
| `manifests/rules.ts` | The named rules that turn an intent into a wire plan (PV-03). |
| `catalog/catalog.ts` | The model catalog reader and cache (PV-01). |
| `catalog/cost.ts` | The price to the estimated cost (CO-01). |
| `catalog/models.ts` | The model list request for a provider. |
| `catalog/bundled-catalog.json` | The catalog copy that works with no network. |
| `adapters/openai.ts` | The OpenAI chat adapter. |
| `adapters/anthropic.ts` | The Anthropic messages adapter. |
| `adapters/ollama.ts` | The Ollama chat adapter. |
| `wire/stream.ts` | `runChat`: the request, the stream and the usage record. |
| `wire/sse.ts` | The server-sent event reader and the abort helper. |
| `wire/types.ts` | The neutral content parts: text and image. |
| `wire/classify.ts` | The HTTP status and text map to one error class (KS-06, ER-04). |
| `tests/fixtures/` | The recorded provider traffic (TS-01). |

### packages/core

| File | What it does |
|---|---|
| `keys/vault.ts` | The encrypted key vault: PBKDF2, AES-GCM, export and import (KS-01, KS-02). |
| `identity/accounts.ts` | The account records and the password rules on this device. |
| `identity/identity.ts` | The Google identity and the recovery address rules. |
| `identity/rbac.ts` | The permission keys, the roles and the role records. |
| `chat/chat.ts` | `sendChat`: the chat orchestration, the budget check and the usage event. |
| `chat/models.ts` | Load the model list of a provider. |
| `chat/usage.ts` | The usage bus (CO-04). |
| `chat/budget.ts` | The budget limits and the warning ratio (CO-02). |
| `chat/scene.ts` | The scene schema and its limits. |
| `agent/agent.ts` | The agent loop, the events and the approval request. |
| `agent/tools.ts` | The tool definitions, the risk levels and the protected paths (AS-02, MC-04). |
| `agent/prompts.ts` | The system prompt and the guard prompt. |
| `agent/github.ts` | The GitHub commit call and the repository rules. |

## Where to put a new file

| You add | Go to | Also change |
|---|---|---|
| A public page | `apps/web/src/pages/` | `app/router.tsx` and `app/Site.tsx` |
| A part of the workspace screen | `apps/web/src/app/workspace/` | `WorkspaceScreen.tsx` imports it |
| A settings section | `apps/web/src/pages/settings/` | `SettingsPage.tsx` shows it |
| A workspace panel or card | `apps/web/src/components/` | The screen that shows it |
| A brand primitive or an icon | `apps/web/src/components/ui/` | Nothing |
| A saved record in the browser | `apps/web/src/stores/` | Add a schema version and a test file |
| A call to a server or an API | `apps/web/src/services/` | Nothing |
| A pure helper | `apps/web/src/lib/` | Add a test file next to it |
| A provider | `packages/providers/src/builtins.ts` | Add one adapter if the wire format is new |
| A tool | `packages/core/src/tools.ts` | Nothing |
| A rule for every layer | `packages/shared/src/` | Nothing |
| A check of the repository | `tools/` | `package.json` |

## The other folders

| Path | What it holds |
|---|---|
| `e2e/` | The Playwright specs: the smoke test, the account flow, the connectors and the vault transfer. |
| `tools/check-layers.mjs` | The layer check (AR-01). |
| `tools/fake-provider.mjs` | The local provider for a test with no key. Port 8788. |
| `tools/fake-mcp.mjs` | The local MCP server for a test. Port 8789. |
| `docs/` | The architecture, this map, the product rules, the style, the glossary and the test plan. |
