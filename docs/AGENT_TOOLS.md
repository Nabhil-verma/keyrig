# Agent tools

This document covers AS-01, AS-02, AS-03, AS-04 and MC-04.

The agent is off by default. Turn it on in **Settings → Agent tools**. Read the risk list first.
keyrig sends the tool list to the provider only after you agree.

## What the agent works on

The agent works on a **workspace**: a set of text files inside this browser, for one account.
A browser has no file system, so keyrig does not pretend to have one. There is no shell tool for
this reason. A file leaves the browser only when you download it.

## The tools

| Tool | Risk | Approval | What it changes |
|---|---|---|---|
| `list_files` | Read only | None | Reads the file names into the chat. |
| `read_file` | Read only | None | Reads one file into the chat. The text goes to your provider. |
| `search_files` | Read only | None | Reads matching lines into the chat. |
| `write_file` | Writes | Each call, unless you turn on auto approval | Writes or replaces one file in the workspace. |
| `delete_file` | Deletes | Every call | Deletes one file. keyrig cannot restore it. |
| `create_scene` | Read only | None | Asks keyrig to render a 3D scene with three.js. |
| `github_commit` | Writes outside keyrig | Every call, with the profile switch on | Writes a commit to your GitHub repository. |

## The approval card

Before a risky call, keyrig shows one card:

- the tool name and its risk;
- every effect of the tool;
- the exact arguments, including the path and the first part of the text;
- **Approve once** and **Deny**.

A deny is a result, not an error. The model reads "the user denied this action" and stops.
The next call asks again. Auto approval never covers a delete or a commit.

## Protected paths (AS-02)

keyrig refuses a read, a write, a delete and a commit for:

- a folder such as `node_modules`, `.git`, `.ssh`, `.aws`, `.gnupg`, `.azure`, `.kube`, `.docker`;
- a `.env` file, `.npmrc`, `.netrc`, `.git-credentials`, `credentials`, `id_rsa`, `id_ed25519`;
- an extension such as `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.kdbx`, `.ppk`;
- a file name that holds `secret`, `credential`, `password`, `apikey` or `token`.

A path must be relative and it must stay inside the workspace. `../` is an error.

## Strict input (MC-05)

keyrig checks every call against the tool schema. An unknown field, a missing field, a wrong type or
an oversized value is an error. The model reads the message and can correct the call.
A tool result states `ok`, a short `summary` and the data. A long result is cut, and the summary says so.

## The agent loop

The loop lives in `packages/core/src/agent.ts`. It runs at most 8 steps. The limits are in
`packages/core/src/tools.ts`:

- 200,000 characters for one file;
- 200 files and 1,000,000 characters for the workspace;
- 20 files and 400,000 characters for one commit;
- 20,000 characters for one tool result.

## The 3D scene (AS-04)

The model sends scene data. keyrig renders it. The model never runs a renderer, so a scene cannot
start code. The format is `keyrig.scene` version 1 in `packages/core/src/scene.ts`:

- node types: `box`, `sphere`, `cylinder`, `cone`, `torus`, `plane`;
- a colour is `#rrggbb`, a position is three numbers, a rotation is in radians;
- at most 200 nodes and 8 lights.

three.js loads only when a scene arrives, so a chat without a scene pays nothing.

## The GitHub commit (AS-01)

A commit needs three things at the same time:

1. the **Allow the AI to commit** switch in the profile, which needs a written acknowledgement of the risks;
2. a connected GitHub account and a repository;
3. your **Approve once** on the approval card for that commit.

The token lives in the encrypted vault. It never goes to a provider.
keyrig writes the files you approve. It cannot delete a file on GitHub. It sends the new commit as a
child of the current branch head, so it cannot drop a commit.
