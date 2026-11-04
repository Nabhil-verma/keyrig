import { KeyrigError } from "@keyrig/shared";
import { buildTool, type Tool } from "./toolDefinition";

/**
 * Phase 2, item 1: a tool draft from a description, and the review diff.
 *
 * keyrig has no server in local mode, so the "agent" here is a deterministic
 * drafter: it reads the description and writes a small tool with one text
 * field. The person reads the diff and saves the tool. Nothing is saved and
 * nothing runs before that save.
 */

export interface ToolDiffLine {
  kind: "same" | "add" | "remove";
  text: string;
}

const DRAFT_NOTE =
  "This draft reads one text field and returns the text unchanged. Change the script before you save the tool.";

function slugName(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 3);
  const base = words.length > 0 ? words.join("_") : "new_tool";
  const name = `draft_${base}`.slice(0, 40);
  return name.replace(/_+$/, "") || "draft_tool";
}

/** Draft a tool from one sentence. The tool is never saved here. */
export function draftTool(description: string, now: number = Date.now()): Tool {
  const text = description.trim();
  if (text.length < 8) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "tool_description_short",
      message: "Describe the tool in a full sentence.",
      retryable: false,
      action: "none",
    });
  }
  const tool = buildTool(
    {
      name: slugName(text),
      description: text.slice(0, 500),
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text that the tool works on.", maxLength: 20_000 },
        },
        required: ["text"],
        additionalProperties: false,
      },
      permissions: ["none"],
      script: 'return { result: String(input.text ?? "") };',
      source: "user",
    },
    now,
    `draft_${now.toString(36)}`,
  );
  return tool;
}

export function draftNote(): string {
  return DRAFT_NOTE;
}

function jsonLines(value: unknown): string[] {
  return JSON.stringify(value, null, 2).split("\n");
}

/** A line diff of the script. It uses the longest common subsequence. */
function scriptDiff(before: string, after: string): ToolDiffLine[] {
  const left = before.split("\n");
  const right = after.split("\n");
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = table[i];
      const nextRow = table[i + 1];
      if (row === undefined || nextRow === undefined) {
        continue;
      }
      row[j] = left[i] === right[j] ? (nextRow[j + 1] ?? 0) + 1 : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const lines: ToolDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: "same", text: left[i] ?? "" });
      i += 1;
      j += 1;
      continue;
    }
    if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      lines.push({ kind: "remove", text: left[i] ?? "" });
      i += 1;
    } else {
      lines.push({ kind: "add", text: right[j] ?? "" });
      j += 1;
    }
  }
  for (; i < left.length; i += 1) {
    lines.push({ kind: "remove", text: left[i] ?? "" });
  }
  for (; j < right.length; j += 1) {
    lines.push({ kind: "add", text: right[j] ?? "" });
  }
  return lines;
}

/**
 * The review diff. A null `before` shows every line as an addition, because a
 * new tool adds all of it. A field that did not change stays out of the diff.
 */
export function diffTools(before: Tool | null, after: Tool): ToolDiffLine[] {
  if (before === null) {
    return [
      { kind: "add", text: `name: ${after.name}` },
      { kind: "add", text: `description: ${after.description}` },
      { kind: "add", text: `permissions: ${after.permissions.join(", ")}` },
      ...jsonLines(after.inputSchema).map((text) => ({ kind: "add" as const, text })),
      ...after.script.split("\n").map((text) => ({ kind: "add" as const, text })),
    ];
  }
  const lines: ToolDiffLine[] = [];
  const field = (label: string, oldValue: string, newValue: string): void => {
    if (oldValue === newValue) {
      return;
    }
    lines.push({ kind: "remove", text: `${label}: ${oldValue}` });
    lines.push({ kind: "add", text: `${label}: ${newValue}` });
  };
  field("name", before.name, after.name);
  field("description", before.description, after.description);
  field("permissions", before.permissions.join(", "), after.permissions.join(", "));
  field("version", String(before.version), String(after.version));
  const schemaBefore = JSON.stringify(before.inputSchema);
  const schemaAfter = JSON.stringify(after.inputSchema);
  if (schemaBefore !== schemaAfter) {
    lines.push(
      ...jsonLines(before.inputSchema).map((text) => ({ kind: "remove" as const, text })),
      ...jsonLines(after.inputSchema).map((text) => ({ kind: "add" as const, text })),
    );
  }
  if (before.script !== after.script) {
    lines.push(...scriptDiff(before.script, after.script));
  }
  return lines.length === 0 ? [{ kind: "same", text: "No change." }] : lines;
}
