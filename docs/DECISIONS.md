# Decisions

The owner answered the open questions in section 7 of the reference spec on 2026-10-17.

| Number | Question | Decision |
|---|---|---|
| D-01 | First platform | Web and desktop. The web app comes first. Keys use WebCrypto (KS-02). The desktop keychain comes later (KS-01). |
| D-02 | v1 scope | Chat, arena and artifacts. The coding agent comes in Phase 3. |
| D-03 | Day-one providers | OpenAI-compatible, Anthropic and Ollama. |
| D-04 | Server | No server. All data stays on the device. Corrected 2026-10-29: one optional hosted model runs on keyrig's Worker at `/api/ai/v1`. It runs only when the visitor picks it, and every other provider is still called from the browser (D-14). **Amended by D-07.** |
| D-05 | License | MIT. |
| D-06 | Teams | No. keyrig is for one user at a time. **Superseded by D-07 for accounts and roles.** |

## Consequences

- KS-02 is the first key rule to build. KS-01 is a later item for the desktop app.
- PR-01 held while the repository had no server code. It changed on 2026-10-29: the Worker holds one route for the optional hosted model. The rule now reads: no keyrig server receives a key, and no keyrig server sees a prompt unless the visitor picks the hosted model.
- The catalog cache lives in the browser. The app must start with the cache when the network is off (PV-01).
- Recorded-traffic tests replace real keys in CI (TS-01).

## Phase 3 decisions (2026-11-01)

| Number | Question | Decision |
|---|---|---|
| D-16 | Sign-in | A username and a password still make the account. Google adds a Gmail recovery address only. GitHub adds a commit account. Neither link signs in to keyrig. |
| D-08 | OAuth without a server | Google Identity Services with a public client id, and the GitHub device flow with a public client id. A browser holds no client secret, so D-04 holds. |
| D-09 | Agent tools | The tools work on a workspace in the browser. There is no shell tool, because a browser cannot start a process. The limits are in `packages/core/src/tools.ts`. |
| D-10 | 3D modelling | The model sends scene data. keyrig renders it with three.js. The model does not edit geometry in a viewport. |
| D-11 | AI commit | A commit needs the profile switch, a connected account and a per-call approval. A delete and a commit never use auto approval. |

## D-07 (2026-11-04)

keyrig gets an optional backend on freebuff. Accounts, roles, marketplace, and feature requests need it.
Local mode stays complete. The default is local mode.

D-07 replaces D-04 and D-06 for these four features only. It does not change the key path, the hosted
model or the local records.

### What the backend can store

The backend stores one row for each item in this table. Each row belongs to one account.

| Item | The fields that the backend can store |
|---|---|
| Account | The account name, the password salt and hash, the creation date and the last sign-in date. |
| Role | The account name, the role id and the date of the change. |
| Published tool | The name, the description, the permissions, the version, the author, the tags, the tool definition and the install count. |
| Feature request | The title, the description, the category, the status, the status reason, the vote count and the duplicate mark. |
| Vote | The account name, the item id and the date. |
| Moderation log | The actor, the action, the item id and the date. |

The password row holds only a PBKDF2-SHA-256 salt and hash. The backend never stores the password.

### What the backend can never store

- A provider key, a key fragment, a passphrase or a request header.
- A chat, a prompt, a response or a chat title.
- A cost, a usage record, a spend total or a streak.
- A workspace file or a tool argument.
- A local path or a file name from the device.
- A telemetry event of any kind (PR-05).

The request allowlist in [packages/shared/src/backend.ts](../packages/shared/src/backend.ts) keeps four
fields: `account`, `publishedTools`, `featureRequests` and `votes`. The Worker refuses any other field and
any key-like value in [sites-preview/backend.mjs](../sites-preview/backend.mjs).

### Consequences

- An offline start still works. Local mode opens the vault and the saved catalog with no network.
- Recorded-traffic tests still replace real keys (TS-01). The backend changes no test fixture.
- The backend gets only the four fields in [SECURITY.md](SECURITY.md). No chat, prompt, key, cost,
  usage or streak data goes to it (PR-05).
- The key path does not change. No key reaches the backend, a tool or a published item (PR-01).
- The routes live at `/api/backend/*` on the same Worker. They refuse every call with a 503 when the
  site has no database binding, so local mode and the hosted model do not depend on them.
- The backend is optional. An account, a tool and a feature request also work as a local record. A person
  who never signs in to the backend sees the full product.

### The store of each item

| Item | Local mode | Backend mode |
|---|---|---|
| Account and role | Browser storage | The account row and the role row |
| Tool | Browser storage | The published tool rows and the local copy |
| Feature request | Browser storage | The request rows and the local copy |
| Vote | Browser storage | The vote rows and the local copy |

See [SECURITY.md](SECURITY.md) for the route list and the enforcement notes.

## D-17 Phase 7 is removed (2026-11-04)

The owner removed Phase 7 from the brief. keyrig does not build the Feature Scout, the `/scout` route
or the ranked backlog, and no building starts without an approval in any case. Phase 6 is the last
phase of this brief. There is no route, no store and no test for Phase 7.
