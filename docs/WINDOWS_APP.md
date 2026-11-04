# The Windows app

This document is the plan for the desktop app on Windows. It does no work on its own.
Read it, change it, then build it.

## The goal

The web app needs a browser and a server. A browser blocks a call to an MCP server that has no CORS
header. A browser wipes the storage when the user clears the cache. A browser cannot start a process.

The Windows app removes these three limits. The app keeps every product rule. Data stays on the
device. No keyrig server receives a key.

KS-01 is the one rule that the web app cannot meet. The desktop app meets it.

## The shell

The app uses Tauri 2. The shell is a thin Rust host. It loads the same React app that `apps/web`
builds today.

| | Tauri 2 (this plan) | Electron (the fallback) |
|---|---|---|
| Engine | WebView2. It is Chromium, and Windows 10 and 11 have it. | Chromium, bundled in the app. |
| Installer size | About 10 MB, plus the WebView2 runtime. | About 100 MB. |
| Work to reuse the web app | None. The build output is the same. | None. |
| OS secure store | The `keyring` crate writes to Credential Manager. | `safeStorage` writes a DPAPI blob. |
| No CORS limit | Yes, with the HTTP plugin. | Yes, in the main process. |
| Playwright can drive it | No. It needs `tauri-driver` and msedgedriver. | Yes, with the Electron driver. |
| Memory at rest | Small. The runtime is shared. | Larger. |

The reference spec names both options for KS-01. This plan picks Tauri because the installer is small
and the engine is the one that the end-to-end tests already run on. Pick Electron instead if the
spike in Phase 0 fails on the WebView2 engine, or if a scripted desktop test becomes a hard
requirement.

## The repository layout

The desktop target adds one folder. It does not add a package.

```
apps/desktop/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    capabilities/default.json
    src/main.rs          the window, the keychain command, the deep link
    icons/
  README.md
apps/web/src/platform/
  platform.ts            which target is running
  desktopStorage.ts      StorageLike on the app data folder
  desktopFetch.ts        fetch through the HTTP plugin
```

`apps/web` gets one small change: it reads the platform adapters at boot. Both targets build from
`npm run build`. `tools/check-layers.mjs` needs no change, because `apps/desktop` holds no TypeScript.

## The storage seam

`StorageLike` is synchronous. The file system is not. The app solves this in one place.

1. The shell reads the store file before the first frame.
2. `platform.ts` builds a `StorageLike` that reads from memory and writes to a queue.
3. The queue writes to disk after each change. A write goes to a temporary file first, then it
   replaces the store file. A crash cannot cut a document in half.

Each stored document keeps the `VersionedDocument` envelope from `packages/shared/src/schema.ts`.
AR-03 still holds, and a document from a newer build still refuses to load.

| Path | Contents |
|---|---|
| `%APPDATA%\keyrig\store.json` | The vault, the settings, the accounts, the threads and the workspace |
| `%LOCALAPPDATA%\keyrig\cache\` | The model catalog cache. The app can lose it. |
| `%LOCALAPPDATA%\keyrig\logs\` | Redacted text only |

A file in `%APPDATA%` is plain text, except for the vault. The vault keeps the KS-02 format: a
WebCrypto envelope with a key from the user password. The app uses one crypto path on both targets.

WARNING: Do not add a second crypto implementation in Rust. Two implementations drift, and one of
them will be wrong.

## KS-01: the OS secure store

KS-01 says the desktop app MUST use the OS keychain. The plan keeps the user password as the default,
and adds one opt-in switch.

- The switch is "Remember on this PC". It appears in Settings, under Security, in the vault section.
- When the switch is on, the app writes the unlocked vault key to Credential Manager through the
  `keyring` crate. The entry is scoped to the Windows user account and the app id.
- At the next start, the app reads the entry and unlocks the vault without a password. The vault
  screen shows "Unlocked with Windows" and a Forget button.
- Forget deletes the entry and locks the vault. A wrong entry, or a copied store file, still needs
  the password.
- The switch is off by default. A shared computer therefore keeps the password gate.

The test that KS-01 names does not change: search the data folder for the key text, and find nothing.
Add one test: a second Windows account cannot read the entry.

The Rust command accepts no key text. It stores and loads one opaque blob. No key crosses the IPC
boundary in clear text, so the KS-03 redaction path stays the only one.

## The network seam

All provider and tool calls already pass through one function: `bindFetch` in
`packages/shared/src/fetch.ts`. The desktop build injects the HTTP plugin fetch there. This gives
three results:

- No CORS failure. The MCP connector in `apps/web/src/services/mcp.ts` works with any server. The app
  no longer shows "check the URL and the CORS policy".
- Ollama and LM Studio on `127.0.0.1` work without a browser exception.
- The provider list loads, and the hosted model is no longer the only path.

The URL checks stay. KS-07 still blocks a cloud metadata address, and the connector check still
refuses a bad scheme. A desktop app has more network reach, not less control.

## The routing rule

`apps/web/src/app/router.tsx` reads `window.location.pathname`. In a browser, the host rewrites an
unknown path to `index.html`. The desktop protocol is not a host, and it does not rewrite.

The plan:

1. The window always opens at `/`.
2. A reload returns to `/`. The app keeps the last page in the store and restores the page after the
   first frame.
3. A deep link, such as `keyrig://oauth`, passes an explicit route to the app. It never depends on a
   path rewrite.

Phase 0 proves this before the work continues. If the protocol serves `/settings` as a file, keep the
history router. If it does not, the desktop build uses the hash router instead. The change stays
inside `router.tsx`.

## The phases

Each phase ends with a check that a reviewer can run.

### Phase 0: the spike, about 2 days

Build an empty Tauri window that loads `apps/web/dist`. No product code changes.

Check these, and write the result in this file:

- Framer Motion, three.js and the WebGPU-free path in `SceneView.tsx` render in WebView2.
- The brand fonts load from `public/brand` and `public/fonts`.
- The vault opens, and the unlock time is close to the browser time.
- A direct visit to `/settings` and a reload of `/app` behave as the routing rule says.
- The app starts with the network off, and the catalog cache still loads (PV-01).

WARNING: Stop and reconsider the shell if three.js or the vault fails here. Do not carry the failure
into the phases below.

### Phase 1: the shell and the store, about 4 days

- Add `apps/desktop` with the window, the icon, the product name and the single-instance plugin.
- Add `apps/web/src/platform/` and the boot gate. The app renders after the store is ready.
- Move the storage read and write in `apps/web/src/lib/storage.ts` behind the adapter.
- Remember the window size, the position and the theme.

Acceptance: a restart restores the size, the settings, the threads and the workspace. `npm test` and
`npm run typecheck` pass, and so does the web build.

### Phase 2: KS-01, about 3 days

- Add the `keyring` commands, the Remember switch, the Forget action and the unlock state.
- Add the two KS-01 tests.
- Add the text to `docs/DECISIONS.md` and to `docs/GLOSSARY.md` if a new word appears.

Acceptance: with the switch on, a restart opens the vault without a password. With the switch off,
the password is required. A folder search finds no key.

### Phase 3: the network, about 3 days

- Add the HTTP plugin, the capability allowlist and the `desktopFetch` adapter.
- Pass the adapter through `bindFetch`. Do not bypass the URL checks.
- Test with the fake provider, then with one MCP server that has no CORS header.

Acceptance: the MCP server answers, the model list loads, and a blocked address still fails with the
KS-07 error.

### Phase 4: the real folder, about 6 to 10 days, decide after Phase 3

This phase is optional for the first release. The browser workspace holds 200 files in one store
document. A desktop user expects a folder on disk.

- Add a workspace mode: "In keyrig" or "In a folder".
- Extend AS-02 for Windows. Block `%WINDIR%`, `%PROGRAMFILES%`, `%APPDATA%\keyrig`, the `.ssh` folder,
  the system drive root and any path outside the chosen folder.
- Ask for approval on every write outside the chosen folder. A delete still never uses auto approval
  (D-11).

WARNING: Do not let the model write to a path with `..` after the root check. Resolve the real path
first, then compare the prefix. A junction or a symbolic link can point outside the folder.

Acceptance: a write outside the folder is refused, and the refusal names the rule.

### Phase 5: the installer, about 3 days

- Build an NSIS installer for each user, with no admin prompt. Add an MSI only if a buyer asks.
- Sign the binary. Without a signature, SmartScreen shows a warning on every first run.
- Add the WebView2 runtime check. The installer installs the runtime when it is absent.
- Add the updater with a signed manifest, or turn auto update off and ship a download link.
- Add `windows-latest` to CI for `cargo check` and an unsigned build.

Acceptance: a clean Windows 11 machine, with no WebView2 update, installs and starts the app.

## Testing

| Layer | How it is tested |
|---|---|
| `packages/*` | `npm test`. No change. |
| The adapters | Unit tests with a fake storage object and a fake fetch. |
| The UI | `npm run test:e2e` on the web build. No change. |
| The desktop shell | A manual checklist, then `tauri-driver` in a nightly job. |

The desktop shell has no scripted test in the first release. Playwright cannot drive WebView2. This
is the main gap, and it is the reason to keep the Electron fallback open.

The manual checklist is one page in `apps/desktop/README.md`. It covers the first start, the vault,
the import and export, the MCP call, the window state, a 150 percent scale display and a start with
no network.

## Risks

| Risk | Effect | Answer |
|---|---|---|
| The WebView2 runtime is old on a managed machine | A feature fails, such as three.js or WebCrypto | The installer updates the runtime. The app checks the version at start. |
| Google blocks its sign-in page in an embedded window | The Google link fails (D-16) | Open the system browser, then return through the deep link. The account still works without Google. |
| The store file is plain text | A reader sees the threads and the workspace | The vault stays encrypted. Say so in `docs/PRODUCT_RULES.md` and on the Security page. |
| A signing certificate costs money | The build is unsigned | Plan the cost, or ship unsigned with a clear note. |
| No scripted desktop test | A shell regression reaches a user | Keep the checklist short, and run it before each release. |

## Conflicts to settle before Phase 1

1. **D-09 says there is no shell tool, because a browser cannot start a process.** A desktop app can.
   This plan keeps the shell tool out of the first release. It is the largest risk surface in the
   product. Record the decision, then add the tool later behind a per-call approval.
2. **PR-01 says no keyrig server receives a key.** The hosted model route stays. The desktop app does
   not change PR-01, and it does not depend on the route.

## Open questions

- Do you accept Tauri, with Electron as the fallback?
- Is there a code signing certificate, or does the first release ship unsigned?
- Is "Remember on this PC" off by default, or on?
- Does the first release include the real folder workspace (Phase 4)?

## Effort

Phase 0 to 3 and Phase 5 total about 15 working days for one person. Phase 4 adds 6 to 10 days.
The work is one new folder, one new adapter module and four small changes in `apps/web`.

## What this plan does not cover

- A daemon or a CLI (AR-05, KS-08, KS-09).
- A macOS or Linux build. The same shell builds for both, but the keychain and the installer differ.
- The Microsoft Store.
- Telemetry.
