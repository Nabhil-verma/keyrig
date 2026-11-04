import { KeyrigError, holdsKey } from "@keyrig/shared";

/**
 * Phase 2, item 1: one tool type for the local tool system.
 *
 * A tool states its source and its permissions. The permissions are the whole
 * contract: a tool that asks for no permission cannot reach the network, the
 * workspace files or more code. The warning text in this file is the one text
 * that the app shows before a person creates, enables, imports or installs a
 * tool (AS-01).
 *
 * This file holds no UI code. It holds no key (PR-01).
 */

export const TOOL_PERMISSIONS = ["network", "files", "run-code"] as const;

export type ToolPermission = "none" | (typeof TOOL_PERMISSIONS)[number];

export type ToolSource = "built-in" | "user" | "marketplace";

export type ToolFieldType = "string" | "number" | "boolean" | "array";

export interface ToolFieldSchema {
  type: ToolFieldType;
  description: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolFieldSchema>;
  required: string[];
  additionalProperties: false;
}

export interface Tool {
  /** A stable id. A built-in tool keeps its id across a reset. */
  id: string;
  /** The name that the model reads. */
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  permissions: ToolPermission[];
  source: ToolSource;
  version: number;
  /** The body of the sandbox function. It receives input and api. */
  script: string;
  updatedAt: string;
}

/** The warning says what the code can do and what it cannot do. */
export const TOOL_WARNING_TITLE = "Read this before you use a tool";
export const TOOL_WARNING_TEXT =
  "Tool code can read data and run actions. A tool runs in a sandbox with no access to your key vault. Check the permissions below before you continue.";
export const TOOL_SCRIPT_WARNING =
  "The script runs in a Web Worker. A tool with no permission cannot use the network, a workspace file or more code.";

export const TOOL_NAME_LIMIT = 40;
export const TOOL_DESCRIPTION_LIMIT = 500;
export const TOOL_SCRIPT_LIMIT = 8_000;
export const MAX_TOOL_FIELDS = 12;

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export const PERMISSION_LABELS: Record<ToolPermission, string> = {
  none: "No permissions",
  network: "Network",
  files: "Workspace files",
  "run-code": "Run more code",
};

export const PERMISSION_EFFECTS: Record<ToolPermission, string> = {
  none: "The tool works on the input only.",
  network: "The tool can send a request from this browser. It can send your input to a server that you did not choose.",
  files: "The tool can read the workspace text that you give it. It cannot read the key vault.",
  "run-code": "The tool can start more code inside its sandbox.",
};

function invalid(code: string, message: string): KeyrigError {
  return KeyrigError.fromCategory("invalid_request", {
    code,
    message,
    retryable: false,
    action: "none",
  });
}

export function isToolPermission(value: unknown): value is ToolPermission {
  return value === "none" || (TOOL_PERMISSIONS as readonly string[]).includes(value as string);
}

/** Keep known permissions, remove a copy and put "none" alone. */
export function normalizePermissions(input: unknown): ToolPermission[] {
  if (!Array.isArray(input)) {
    return ["none"];
  }
  const kept = new Set<ToolPermission>();
  for (const item of input) {
    if (isToolPermission(item) && item !== "none") {
      kept.add(item);
    }
  }
  if (kept.size === 0) {
    return ["none"];
  }
  return [...kept].sort();
}

/** The lines that the warning card shows for a permission list. */
export function permissionEffects(permissions: readonly ToolPermission[]): string[] {
  return normalizePermissions([...permissions])
    .map((permission) => PERMISSION_EFFECTS[permission])
    .filter((line): line is string => typeof line === "string");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readField(name: string, value: unknown): ToolFieldSchema {
  if (!isPlainObject(value)) {
    throw invalid("tool_schema_invalid", `The field ${name} must be one object.`);
  }
  const type = value.type;
  if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array") {
    throw invalid("tool_schema_invalid", `The field ${name} needs one type: string, number, boolean or array.`);
  }
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length === 0) {
    throw invalid("tool_schema_invalid", `The field ${name} needs a description.`);
  }
  const field: ToolFieldSchema = { type, description: description.slice(0, 200) };
  for (const limit of ["minLength", "maxLength", "minimum", "maximum", "maxItems"] as const) {
    const number = value[limit];
    if (typeof number === "number" && Number.isFinite(number)) {
      field[limit] = number;
    }
  }
  return field;
}

/** MC-05: the schema is strict. An unknown field type or a bad field stops the tool. */
export function normalizeSchema(input: unknown): ToolInputSchema {
  if (!isPlainObject(input)) {
    throw invalid("tool_schema_invalid", "The input schema must be one object.");
  }
  if (input.type !== "object") {
    throw invalid("tool_schema_invalid", "The input schema must have the type object.");
  }
  if (!isPlainObject(input.properties)) {
    throw invalid("tool_schema_invalid", "The input schema needs a properties object.");
  }
  const entries = Object.entries(input.properties);
  if (entries.length === 0) {
    throw invalid("tool_schema_invalid", "The input schema needs at least one field.");
  }
  if (entries.length > MAX_TOOL_FIELDS) {
    throw invalid("tool_schema_invalid", `The input schema holds more than ${MAX_TOOL_FIELDS} fields.`);
  }
  const properties: Record<string, ToolFieldSchema> = {};
  for (const [name, value] of entries) {
    properties[name] = readField(name, value);
  }
  const required = Array.isArray(input.required)
    ? [...new Set(input.required.filter((item): item is string => typeof item === "string"))]
    : [];
  for (const name of required) {
    if (!(name in properties)) {
      throw invalid("tool_schema_invalid", `The required field ${name} is not in the schema.`);
    }
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export interface NewToolInput {
  name: string;
  description: string;
  inputSchema: ToolInputSchema | unknown;
  permissions?: unknown;
  script: string;
  source?: ToolSource;
}

function checkText(field: string, value: unknown, limit: number): string {
  if (typeof value !== "string") {
    throw invalid("tool_invalid", `The ${field} must be text.`);
  }
  const text = value.trim();
  if (text.length === 0) {
    throw invalid("tool_invalid", `Add a ${field}.`);
  }
  if (text.length > limit) {
    throw invalid("tool_invalid", `The ${field} is longer than ${limit} characters.`);
  }
  // PR-01: a tool that holds a key is refused before it reaches a record.
  if (holdsKey(text)) {
    throw invalid("tool_holds_key", "The tool holds a key. A tool must not carry a credential.");
  }
  return text;
}

/**
 * Check every part of a new tool. The function returns a clean tool, so a
 * record never holds an unknown field.
 */
export function buildTool(input: NewToolInput, now: number, id: string): Tool {
  const name = checkText("name", input.name, TOOL_NAME_LIMIT).toLowerCase();
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw invalid("tool_name_invalid", "Use 2 to 40 lowercase letters, digits or underscores. Start with a letter.");
  }
  const description = checkText("description", input.description, TOOL_DESCRIPTION_LIMIT);
  const script = checkText("script", input.script, TOOL_SCRIPT_LIMIT);
  const source: ToolSource =
    input.source === "marketplace" ? "marketplace" : input.source === "built-in" ? "built-in" : "user";
  return {
    id,
    name,
    description,
    inputSchema: normalizeSchema(input.inputSchema),
    permissions: normalizePermissions(input.permissions),
    source,
    version: 1,
    script,
    updatedAt: new Date(now).toISOString(),
  };
}

/** A small deterministic hash. It marks the exact permissions and code. */
export function toolFingerprint(tool: Pick<Tool, "permissions" | "version" | "script">): string {
  const text = `${tool.version}|${tool.permissions.join(",")}|${tool.script}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v${tool.version}:${(hash >>> 0).toString(16)}`;
}

/** The tool can act on its own only when a person allowed the risk. */
export function needsToolConsent(tool: Tool, approvedFingerprint: string | null): boolean {
  return approvedFingerprint === null || approvedFingerprint !== toolFingerprint(tool);
}
