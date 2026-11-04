# Security and data

keyrig has an optional backend on freebuff. It is used only for accounts, roles, the marketplace and
feature requests. Local mode stays complete and works offline. The default is local mode.

There is no server in local mode. See PR-01 and PR-05 in [PRODUCT_RULES.md](PRODUCT_RULES.md) and D-07 in
[DECISIONS.md](DECISIONS.md).

## Where each item lives

A dash means the item does not apply.

| Data | Stays on the device | The backend can store it | The backend can never store it |
|---|---|---|---|
| Provider key | Yes, encrypted in the vault | No | Yes |
| Passphrase | Yes, never saved in clear text | No | Yes |
| Chat message and prompt | Yes | No | Yes |
| Chat title and thread | Yes | No | Yes |
| Cost, usage and spend of the day | Yes | No | Yes |
| Streak | Yes | No | Yes |
| Tool arguments and tool output | Yes | No | Yes |
| Workspace file | Yes | No | Yes |
| Account name and role | Yes | Yes, when the user signs in | — |
| Role record | Yes, in local mode | Yes, when the user signs in | — |
| Published tool | Yes | Yes, when the user publishes the tool | — |
| Feature request and vote | Yes | Yes, when the user sends the item | — |

## What a request to the backend holds

A request holds four fields and no others:

1. `account`: the account name and the role.
2. `publishedTools`: the tools that the user publishes.
3. `featureRequests`: the requests that the user sends.
4. `votes`: the votes that the user sends.

`backendRequest` in [packages/shared/src/backend.ts](../packages/shared/src/backend.ts) builds the one
request shape. It drops every other field. It drops an allowed field too when that field holds a key-like
string.

## The backend routes

The routes answer under `/api/backend/*` on the same Worker. Without a database binding every call
returns 503, so a site can ship with the backend switched off (local mode is the default).

| Route | Method | Who | What it holds |
|---|---|---|---|
| `/api/backend/account?mode=sign-up` | POST | anyone | One account. The first account on the site is the owner. |
| `/api/backend/account?mode=sign-in` | POST | anyone | The password check and the session cookie. |
| `/api/backend/account` | GET | signed in | The account name and the role. |
| `/api/backend/tools` | GET | anyone | The published tools. |
| `/api/backend/sign-out` | POST | signed in | Ends the session cookie. The local vault is not affected. |
| `/api/backend/tools` | POST | signed in | One published tool: the name, the permissions, the definition, the tags and the version. |
| `/api/backend/requests` | GET | anyone | The feature requests with the vote count and the status. |
| `/api/backend/requests` | POST | signed in | One feature request. |
| `/api/backend/request-votes` | POST | signed in | One vote on one feature request. |
| `/api/backend/request-status` | POST | owner or admin | One request status and its reason. |
| `/api/backend/votes` | POST | signed in | One vote on one tool. |
| `/api/backend/roles` | GET | owner or admin | The account list and the role of each account. |
| `/api/backend/roles` | POST | owner or admin | One role change. |

The password row holds a PBKDF2-SHA-256 salt and hash, never the password. The session is the signed
cookie from `hosted.mjs` under the name `keyrig_backend`.

## Enforcement

- PR-01. No key goes to the backend, to a tool or into a published item.
- PR-01. The publish flow scans for key-like strings and rejects the item. The browser runs
  `packages/shared/src/publish.ts`; the Worker runs the same scan in `sites-preview/backend.mjs`, because a
  server cannot trust a browser. The item is refused, not masked.
- PR-01. A tool runs in a sandbox with no access to the vault. `createToolSandbox` in
  `packages/core/src/agent/sandbox.ts` refuses a capability object that carries the vault, the keys or the
  passphrase, so the app layer cannot hand a key to a tool.
- PR-05. The backend receives only the four fields above. It never receives a chat, a prompt, a key,
  cost data, usage data or a streak.
- PR-05. The streak is a device record. The backend cannot read it and does not hold it.
- PR-01. The published tool is the code that the person chose. It holds no tool input, no chat and no
  key. The publish scan refuses the whole item when it finds a key-like string.

## Tests

- `packages/shared/src/tests/backend.test.ts`: PR-01 and PR-05 for a request to the backend.
- `packages/shared/src/tests/publish.test.ts`: PR-01 for the publish scan.
- `packages/core/src/tests/sandbox.test.ts`: PR-01 for the tool sandbox.
- `sites-preview/backend.test.mjs`: the allowlist, the publish scan, the accounts, the roles, the marketplace,
  the feature requests and the votes.
- `npm run check:layers`: the guards stay in `shared` and `core`, and neither imports a higher layer.
