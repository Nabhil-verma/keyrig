import { describe, expect, it } from "vitest";
import { SANDBOX_BLOCKED_MEMBERS, createToolSandbox } from "../agent/sandbox";

const workspace = { read: (path: string) => ({ path, content: "" }) };
const github = { token: null, owner: "alice", repo: "notes", branch: "main", allowCommit: false };

describe("PR-01 a tool runs in a sandbox with no access to the vault", () => {
  it("keeps the allowed capabilities and nothing else", () => {
    const sandbox = createToolSandbox({ workspace, github });

    expect(Object.keys(sandbox).sort()).toEqual(["github", "workspace"]);
    expect(sandbox.workspace).toBe(workspace);
    expect(Object.isFrozen(sandbox)).toBe(true);
  });

  it("refuses a capability object that holds the vault", () => {
    for (const member of SANDBOX_BLOCKED_MEMBERS) {
      expect(() => createToolSandbox({ workspace, [member]: { secret: "value" } })).toThrow(
        /The sandbox holds no key/,
      );
    }
  });

  it("refuses the vault even when the name is inherited", () => {
    const capabilities = Object.create({ vault: { secret: "value" } }) as Record<string, unknown>;
    capabilities.workspace = workspace;

    expect(() => createToolSandbox(capabilities)).toThrow(/sandbox holds no key/);
  });

  it("does not let a tool add a member to the sandbox", () => {
    const sandbox = createToolSandbox({ workspace }) as Record<string, unknown>;
    expect(() => {
      "use strict";
      sandbox.vault = {};
    }).toThrow();
  });
});
