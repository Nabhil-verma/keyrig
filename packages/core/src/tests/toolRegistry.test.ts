import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import { ToolRegistry } from "../agent/toolRegistry";
import type { NewToolInput } from "../agent/toolDefinition";

const OK = { acknowledged: true } as const;
const NO = { acknowledged: false } as unknown as { acknowledged: true };

const INPUT: NewToolInput = {
  name: "shorten_text",
  description: "Cut a text to a length.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "The text." } },
    required: ["text"],
    additionalProperties: false,
  },
  permissions: ["none"],
  script: 'return { text: String(input.text ?? "") };',
};

function registry(): ToolRegistry {
  return new ToolRegistry({ storage: createMemoryStorage(), now: () => Date.UTC(2026, 10, 4) });
}

describe("MC-02 a copy never changes the original and a reset restores it", () => {
  it("keeps the built-in original byte for byte", () => {
    const tools = registry();
    const original = tools.original("builtin:slugify");
    expect(original).toBeDefined();
    const before = JSON.stringify(original);

    tools.edit("builtin:slugify", { description: "My own slug tool." }, OK);

    expect(JSON.stringify(tools.original("builtin:slugify"))).toBe(before);
    expect(tools.get("builtin:slugify")?.isEdited).toBe(true);
    expect(tools.get("builtin:slugify")?.tool.description).toBe("My own slug tool.");
    expect(tools.get("builtin:slugify")?.tool.source).toBe("user");
  });

  it("drops the copy on a reset and shows the original again", () => {
    const tools = registry();
    const original = tools.original("builtin:slugify");
    tools.edit("builtin:slugify", { description: "My own slug tool." }, OK);

    tools.reset("builtin:slugify");

    expect(tools.get("builtin:slugify")?.isEdited).toBe(false);
    expect(tools.get("builtin:slugify")?.tool.description).toBe(original?.description);
    expect(tools.get("builtin:slugify")?.tool.source).toBe("built-in");
  });
});

describe("AS-01 the tool warning cannot be skipped", () => {
  it("refuses create, edit, import and enable without the confirmation", () => {
    const tools = registry();
    expect(() => tools.create(INPUT, NO)).toThrow(/warning/i);
    expect(() => tools.edit("builtin:slugify", { description: "x y z" }, NO)).toThrow(/warning/i);
    expect(() => tools.enable("builtin:slugify", NO)).toThrow(/warning/i);
    expect(() =>
      tools.importTool({ ...INPUT, name: "imported_tool", script: "return 1;" }, NO),
    ).toThrow(/warning/i);
  });

  it("keeps a new tool off and asks before the first run", () => {
    const tools = registry();
    const tool = tools.create(INPUT, OK);

    expect(tools.get(tool.id)?.enabled).toBe(false);
    expect(tools.canRun(tool.id)).toBe(false);

    tools.enable(tool.id, OK);
    expect(tools.get(tool.id)?.enabled).toBe(true);
    expect(tools.canRun(tool.id)).toBe(false);

    tools.approve(tool.id);
    expect(tools.canRun(tool.id)).toBe(true);
  });

  it("never runs an imported tool on its own", () => {
    const tools = registry();
    const tool = tools.importTool({ ...INPUT, name: "imported_tool", script: "return 1;" }, OK);
    expect(tools.get(tool.id)?.enabled).toBe(false);
    expect(tools.canRun(tool.id)).toBe(false);
    expect(tools.get(tool.id)?.tool.source).toBe("marketplace");
  });
});

describe("AS-01 a permission change asks again before the next run", () => {
  it("clears the approval when the permissions change", () => {
    const tools = registry();
    const tool = tools.create(INPUT, OK);
    tools.enable(tool.id, OK);
    tools.approve(tool.id);
    expect(tools.canRun(tool.id)).toBe(true);

    tools.edit(tool.id, { permissions: ["network"] }, OK);

    expect(tools.get(tool.id)?.needsApproval).toBe(true);
    expect(tools.canRun(tool.id)).toBe(false);
    expect(tools.get(tool.id)?.tool.version).toBe(2);
  });
});

describe("PR-01 a tool record holds no key", () => {
  it("refuses a key inside the tool text", () => {
    const tools = registry();
    expect(() =>
      tools.create(
        {
          ...INPUT,
          name: "leaky_tool",
          script: 'return { key: "sk-ant-abcdefghijklmnopqrstuvwx" };',
        },
        OK,
      ),
    ).toThrow(/key/i);
    expect(tools.list().some((entry) => entry.tool.name === "leaky_tool")).toBe(false);
  });
});

describe("MC-05 a tool schema is strict", () => {
  it("refuses a field type that keyrig does not know", () => {
    const tools = registry();
    expect(() =>
      tools.create(
        {
          ...INPUT,
          name: "bad_schema",
          inputSchema: {
            type: "object",
            properties: { when: { type: "date", description: "A date." } },
            required: ["when"],
            additionalProperties: false,
          },
        },
        OK,
      ),
    ).toThrow(/type/i);
  });
});
