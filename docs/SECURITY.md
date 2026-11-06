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
  the feature requests, the votes, the setup token, the sign-in limits and the missing secret.
- `sites-preview/d1-migration.test.mjs`: the case-insensitive account-name migration, including the
  conflict case that deletes nothing.
- `sites-preview/hosted.test.mjs`: the hosted salt requirement and the hosted session.
- `npm run check:layers`: the guards stay in `shared` and `core`, and neither imports a higher layer.

## Threat model (2026-11-04)

### What keyrig protects

- A provider key in the browser. It is encrypted with AES-GCM and a PBKDF2 key from the passphrase. The
  vault never writes plain text, a label or the last four characters (KS-02, KS-04).
- A key in any text that leaves a subsystem: errors, logs, exports, MCP replies, tool results and
  published items. The one redactor in `packages/shared/src/redact.ts` masks every known provider prefix
  (KS-03).
- The vault from a tool. A tool runs in a worker with no vault object. The worker global has no network
  path unless the tool holds the `network` permission (PR-01).
- A second tab from overwriting a newer vault. Every write checks a generation counter, and a `storage`
  event signs the other tab out (B8).
- A new deployment from the first visitor. The first account needs `FIRST_OWNER_TOKEN` (B5).
- The backend from missing configuration. It refuses every call without `BACKEND_SESSION_SALT` (B10).
- The hosted page from a forged session. It signs with `HOSTED_IP_SALT`, has no literal fallback, and
  refuses the unlock form when the salt is missing or shorter than 16 characters (B10).

### What keyrig does not protect

- A person with the browser profile and the passphrase. They can read the vault. Keyrig is not a defense
  against the device owner.
- A malicious provider. A request sends the prompt to the provider that the person chose.
- A tool with the `network` permission. That permission exists to send data, and the warning says so.
- A custom remote base URL under the strict CSP. The policy lists the bundled providers and localhost.
  A remote OpenAI-compatible host is blocked until it is added to the policy. This is a deliberate limit,
  not a silent fallback.
- XSS in the app itself. The CSP helps, and the production header allows only same-origin scripts. The
  app has no nonce-based policy.

### Changes in this pass

- B1. The vault stores the work factor that opened it. `persist` writes that value, `changePassphrase`
  writes the build default, and an old count is upgraded at unlock. A count outside 1,000 to 2,000,000 is
  a hard error. The vault format and `VAULT_SCHEMA_VERSION` are unchanged.
- B2. The worker deletes `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket`, `WebTransport`,
  `RTCPeerConnection`, `importScripts`, nested workers, `BroadcastChannel`, the storage globals and
  `navigator.sendBeacon`. The properties are non-writable and the global is frozen. The tool body is put
  in the worker source, so the sandbox needs no `eval` or `new Function`. A real Chromium Worker test
  covers the blocked paths and the permitted network path.
- B3. `index.html` has a CSP meta tag. `vercel.json` and `public/_headers` send the strict production
  policy: `script-src 'self'`, `worker-src 'self' blob:`, `object-src 'none'`, `frame-ancestors 'none'`
  and a narrow `connect-src`. The policy allows the provider hosts, `https://models.dev` for the model
  catalog and localhost. `public/_redirects` keeps the SPA rule, because that file takes no headers.
- B4. The redactor patterns come from `PROVIDER_KEY_PREFIXES`, and every manifest names its prefixes or
  an explicit empty list.
- B5. The first owner is decided in one SQL statement. A first sign-up needs the setup token.
- B6. Sign-in allows 5 failures for a name and 20 for an address in 15 minutes, then locks for 15
  minutes. An unknown name runs the same PBKDF2 work and returns the same message.
- B7. Account names are lower-case on write and lookup. A migration moves old names when no two rows
  differ only by case. If two rows do, keyrig changes nothing and records `account_case_conflict`.
- B8. A generation counter is checked before every vault write. Another tab's write signs this tab out.
- PR-01. The tool warning and the marketplace card show `Can send data out` for the network permission.
- PV-01. The service worker caches the shell only. It never caches `/api/` and never reads the vault.
