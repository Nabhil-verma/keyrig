import { describe, expect, it } from "vitest";
import {
  TOOL_SPECS,
  findTool,
  normalizeWorkspacePath,
  protectedReason,
  requiresApproval,
  specsFor,
  validateToolArguments,
} from "../agent/tools";

const writeTool = findTool("write_file");
if (writeTool === undefined) {
  throw new Error("write_file is missing");
}

describe("AS-02 the path rules", () => {
  it("accepts a relative path and joins a doubled slash", () => {
    expect(normalizeWorkspacePath("src//app.ts")).toBe("src/app.ts");
    expect(normalizeWorkspacePath(" notes/plan.md ")).toBe("notes/plan.md");
  });

  it("refuses an absolute path", () => {
    expect(() => normalizeWorkspacePath("/etc/passwd")).toThrow();
    expect(() => normalizeWorkspacePath("C:/keys.txt")).toThrow();
  });

  it("refuses a path that climbs out of the workspace", () => {
    expect(() => normalizeWorkspacePath("../other/a.md")).toThrow();
  });

  it("protects a dot env file, a key file, a key folder and a token name", () => {
    expect(protectedReason(".env")).not.toBeNull();
    expect(protectedReason("config/.env.local")).not.toBeNull();
    expect(protectedReason("certs/server.pem")).not.toBeNull();
    expect(protectedReason(".ssh/id_ed25519")).not.toBeNull();
    expect(protectedReason("docs/my-token.md")).not.toBeNull();
    expect(protectedReason("node_modules/react/index.js")).not.toBeNull();
    expect(protectedReason("src/app.ts")).toBeNull();
  });
});

describe("MC-05 strict tool arguments", () => {
  it("accepts the fields of the tool", () => {
    expect(validateToolArguments(writeTool, JSON.stringify({ path: "a.md", content: "hi" }))).toEqual({
      path: "a.md",
      content: "hi",
    });
  });

  it("refuses an unknown field", () => {
    expect(() =>
      validateToolArguments(writeTool, JSON.stringify({ path: "a.md", content: "hi", mode: "append" })),
    ).toThrow(/mode/);
  });

  it("refuses a missing field", () => {
    expect(() => validateToolArguments(writeTool, JSON.stringify({ path: "a.md" }))).toThrow(/content/);
  });

  it("refuses text that is not JSON", () => {
    expect(() => validateToolArguments(writeTool, "path=a.md")).toThrow();
  });

  it("refuses a value of the wrong type", () => {
    expect(() => validateToolArguments(writeTool, JSON.stringify({ path: 4, content: "hi" }))).toThrow();
  });

  it("refuses a call with no arguments when a field is required", () => {
    expect(() => validateToolArguments(writeTool, "")).toThrow();
  });
});

describe("AS-01 the approval rules", () => {
  it("runs a read with no question", () => {
    const tool = findTool("read_file");
    expect(tool).toBeDefined();
    expect(requiresApproval(tool!, { autoApproveWrites: false })).toBe(false);
  });

  it("asks before a write unless the user turned auto approval on", () => {
    expect(requiresApproval(writeTool, { autoApproveWrites: false })).toBe(true);
    expect(requiresApproval(writeTool, { autoApproveWrites: true })).toBe(false);
  });

  it("always asks for a delete and for a commit", () => {
    expect(requiresApproval(findTool("delete_file")!, { autoApproveWrites: true })).toBe(true);
    expect(requiresApproval(findTool("github_commit")!, { autoApproveWrites: true })).toBe(true);
  });

  it("states the effect of each tool (MC-04)", () => {
    for (const tool of TOOL_SPECS) {
      expect(tool.effects.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("sends only the tools that the user turned on", () => {
    expect(specsFor(["read_file"]).map((tool) => tool.name)).toEqual(["read_file"]);
    expect(specsFor([])).toEqual([]);
    expect(specsFor(["no_such_tool"])).toEqual([]);
  });
});
