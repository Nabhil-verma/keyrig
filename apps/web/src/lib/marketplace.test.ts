import { describe, expect, it } from "vitest";
import { BUILTIN_TOOLS } from "@keyrig/core";
import { installProblem, marketplacePermissions, publishToolProblem, publishedFromTool } from "./marketplace";
import type { PublishedToolRow } from "../services/backendClient";

const KEY = "sk-ant-abcdefghijklmnopqrstuvwx";

function row(overrides: Partial<PublishedToolRow> = {}): PublishedToolRow {
  return {
    id: "tool_1",
    name: "slugify",
    publisher: "alice",
    risk: "read",
    description: "Turn a title into a slug.",
    permissions: ["none"],
    version: 1,
    tags: ["text"],
    definition: {
      name: "slugify",
      description: "Turn a title into a slug.",
      permissions: ["none"],
      inputSchema: { type: "object", properties: {}, required: [] },
      script: "return { slug: String(input.text ?? '') };",
    },
    createdAt: "2026-11-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("PR-01 a published tool holds no key", () => {
  it("refuses a tool whose script holds a key", () => {      const tool = { ...BUILTIN_TOOLS[0]!, script: `return { key: "${KEY}" };` };
    const problem = publishToolProblem(tool);

    expect(problem).toContain("holds a key");
    expect(problem).not.toContain(KEY);
  });

  it("refuses an entry whose definition holds a key", () => {
    const entry = row({
      definition: {
        ...row().definition!,
        script: `return { key: "${KEY}" };`,
      },
    });

    expect(installProblem(entry)).toContain("holds a key");
  });
});

describe("MC-05 an install needs a full tool definition", () => {
  it("refuses an entry with no code", () => {
    expect(installProblem(row({ definition: null }))).toContain("no tool code");
  });

  it("accepts a complete entry", () => {
    expect(installProblem(row())).toBeNull();
  });
});

describe("AS-01 the publish item carries the code and the permissions", () => {
  it("builds a definition from a local tool", () => {
    const tool = BUILTIN_TOOLS[0]!;
    const item = publishedFromTool(tool, [" text ", ""]);

    expect(item.definition.name).toBe(tool.name);
    expect(item.definition.script).toBe(tool.script);
    expect(item.permissions).toEqual([...tool.permissions]);
    expect(item.tags).toEqual(["text"]);
  });

  it("maps a risk level to a permission when the row has no list", () => {
    expect(marketplacePermissions(row({ permissions: [], risk: "external-write" }))).toEqual(["network"]);
    expect(marketplacePermissions(row({ permissions: [], risk: "read" }))).toEqual(["none"]);
  });
});
