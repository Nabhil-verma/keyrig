import type { Tool } from "./toolDefinition";

/**
 * Phase 2, item 1: the premade tools.
 *
 * A built-in tool is a frozen constant. keyrig never changes it in place: an
 * edit makes a user copy and a reset drops the copy. Each script is a pure
 * function body for the sandbox. It receives the input and the api, and it
 * returns JSON data.
 *
 * The built-in tools ask for no permission. They work on the input only.
 */

const BUILTIN_DATE = "2026-11-04T00:00:00.000Z";

function builtin(tool: Omit<Tool, "source" | "updatedAt" | "version">): Tool {
  return Object.freeze({
    ...tool,
    source: "built-in" as const,
    version: 1,
    updatedAt: BUILTIN_DATE,
  });
}

export const TEXT_STATS = builtin({
  id: "builtin:text_stats",
  name: "text_stats",
  description: "Count the words, the characters and the lines of one text.",
  permissions: ["none"],
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to measure.", maxLength: 20_000 },
    },
    required: ["text"],
    additionalProperties: false,
  },
  script: [
    'const text = String(input.text ?? "");',
    "const words = text.trim().length === 0 ? 0 : text.trim().split(/\\s+/).filter(Boolean).length;",
    "return { words, characters: text.length, lines: text.split(/\\r?\\n/).length };",
  ].join("\n"),
});

export const SLUGIFY = builtin({
  id: "builtin:slugify",
  name: "slugify",
  description: "Turn one title into a lowercase slug with single dashes.",
  permissions: ["none"],
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The title to change.", maxLength: 200 },
    },
    required: ["text"],
    additionalProperties: false,
  },
  script: [
    'const text = String(input.text ?? "").toLowerCase();',
    'const slug = text.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");',
    "return { slug };",
  ].join("\n"),
});

export const JSON_FORMAT = builtin({
  id: "builtin:json_format",
  name: "json_format",
  description: "Format one JSON text with two spaces for each level.",
  permissions: ["none"],
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The JSON text.", maxLength: 20_000 },
    },
    required: ["text"],
    additionalProperties: false,
  },
  script: [
    'const value = JSON.parse(String(input.text ?? ""));',
    "return { formatted: JSON.stringify(value, null, 2) };",
  ].join("\n"),
});

export const COUNT_LINES = builtin({
  id: "builtin:count_lines",
  name: "count_lines",
  description: "Count the lines of a list and remove an empty line.",
  permissions: ["none"],
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The list with one item on each line.", maxLength: 20_000 },
    },
    required: ["text"],
    additionalProperties: false,
  },
  script: [
    'const lines = String(input.text ?? "").split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);',
    "return { count: lines.length, lines };",
  ].join("\n"),
});

/** The premade list. The app shows it and a user can edit a copy. */
export const BUILTIN_TOOLS: readonly Tool[] = Object.freeze([
  TEXT_STATS,
  SLUGIFY,
  JSON_FORMAT,
  COUNT_LINES,
]);

export function findBuiltinTool(id: string): Tool | undefined {
  return BUILTIN_TOOLS.find((tool) => tool.id === id);
}
