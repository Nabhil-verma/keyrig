import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import { diffTools, draftTool } from "../agent/toolDraft";
import { ToolRegistry } from "../agent/toolRegistry";

describe("AS-01 the agent draft waits for the person", () => {
  it("makes a draft and saves nothing", () => {
    const registry = new ToolRegistry({ storage: createMemoryStorage() });
    const draft = draftTool("Make a short summary of one text.", Date.UTC(2026, 10, 4));

    expect(draft.source).toBe("user");
    expect(draft.permissions).toEqual(["none"]);
    expect(registry.list().some((entry) => entry.tool.id === draft.id)).toBe(false);
  });

  it("shows every line of a new draft as an addition", () => {
    const draft = draftTool("Make a short summary of one text.");
    const lines = diffTools(null, draft);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.kind === "add")).toBe(true);
  });

  it("shows a changed permission and a changed script line", () => {
    const draft = draftTool("Make a short summary of one text.");
    const next = {
      ...draft,
      permissions: ["network" as const],
      script: `${draft.script}\n// changed`,
    };

    const lines = diffTools(draft, next);

    expect(lines).toContainEqual({ kind: "remove", text: "permissions: none" });
    expect(lines).toContainEqual({ kind: "add", text: "permissions: network" });
    expect(lines.some((line) => line.kind === "add" && line.text.includes("changed"))).toBe(true);
  });

  it("refuses a description that is too short", () => {
    expect(() => draftTool("help")).toThrow(/sentence/i);
  });
});
