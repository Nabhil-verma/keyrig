import { KeyrigError } from "@keyrig/shared";
import type { ToolSpec } from "@keyrig/providers";

/**
 * AS-01, AS-02, MC-04 and MC-05: the keyrig tools.
 *
 * Every tool states its risk and its effect (MC-04). The agent loop asks the
 * user before a risky call (AS-01). The path check keeps a secret out of the
 * workspace (AS-02). Validation rejects an unknown field (MC-05).
 *
 * There is no shell tool. A browser cannot start a process, so keyrig does not
 * pretend to. The coding tools work on a workspace inside this browser.
 */

export type ToolRisk = "read" | "write" | "destructive" | "external-write";

export const RISK_LABELS: Record<ToolRisk, string> = {
  read: "Read only",
  write: "Writes",
  destructive: "Deletes",
  "external-write": "Writes outside keyrig",
};

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  risk: ToolRisk;
  /** MC-04: what the call changes. The approval card shows these lines. */
  effects: string[];
  /** True when every call needs a new yes, even with auto approval on. */
  alwaysAsk: boolean;
  /** True when the call needs the connected GitHub account. */
  needsGithub: boolean;
  parameters: Record<string, unknown>;
}

/** Hard limits, so one turn cannot fill the browser storage. */
export const MAX_FILE_CHARS = 200_000;
export const MAX_WORKSPACE_FILES = 200;
export const MAX_WORKSPACE_CHARS = 1_000_000;
export const MAX_TOOL_RESULT_CHARS = 20_000;
export const MAX_COMMIT_FILES = 20;
export const MAX_COMMIT_CHARS = 400_000;
export const MAX_AGENT_STEPS = 8;
export const MAX_PATH_CHARS = 200;

const FILE_PATH = {
  type: "string",
  minLength: 1,
  maxLength: MAX_PATH_CHARS,
  description: "A relative path in the workspace. Example: src/app.ts",
};

const FOLDER = {
  type: "string",
  maxLength: MAX_PATH_CHARS,
  description: "Show one folder only. Leave it out for the whole workspace.",
};

export const TOOL_SPECS: readonly ToolDefinition[] = [
  {
    name: "list_files",
    title: "List files",
    description: "List the files in the keyrig workspace. Use it before you read or write a file.",
    risk: "read",
    effects: ["Reads the workspace file list into the chat."],
    alwaysAsk: false,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: { folder: FOLDER },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    title: "Read a file",
    description: "Read one text file from the keyrig workspace.",
    risk: "read",
    effects: ["Reads one workspace file into the chat.", "The text goes to your AI provider."],
    alwaysAsk: false,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: { path: FILE_PATH },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    title: "Write a file",
    description:
      "Create a file in the keyrig workspace, or replace the whole file. The file stays in this browser.",
    risk: "write",
    effects: [
      "Writes one file in the keyrig workspace.",
      "It replaces the old text of that file.",
      "The file stays in this browser. keyrig sends it nowhere.",
    ],
    alwaysAsk: false,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: {
        path: FILE_PATH,
        content: { type: "string", maxLength: MAX_FILE_CHARS, description: "The full text of the file." },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_file",
    title: "Delete a file",
    description: "Delete one file from the keyrig workspace. keyrig cannot restore it.",
    risk: "destructive",
    effects: ["Deletes one file from the keyrig workspace.", "keyrig cannot restore the file."],
    alwaysAsk: true,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: { path: FILE_PATH },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_files",
    title: "Search the workspace",
    description: "Find text in the keyrig workspace. Use it to find a file before you change it.",
    risk: "read",
    effects: ["Reads matching workspace lines into the chat.", "The text goes to your AI provider."],
    alwaysAsk: false,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200, description: "Text to find. Case does not matter." },
        folder: FOLDER,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "create_scene",
    title: "Create a 3D scene",
    description:
      "Build a 3D scene from nodes, lights and a camera. keyrig renders it in the chat with three.js. Use a mesh type from the list, a #rrggbb color and a position in scene units.",
    risk: "read",
    effects: ["Renders a 3D scene in this chat with three.js.", "It changes no file and sends nothing."],
    alwaysAsk: false,
    needsGithub: false,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120, description: "A short title for the scene." },
        scene: {
          type: "object",
          description:
            "The scene. It holds nodes, lights and camera. Each node holds type, position, rotation, scale and color.",
        },
      },
      required: ["title", "scene"],
      additionalProperties: false,
    },
  },
  {
    name: "github_commit",
    title: "Commit to GitHub",
    description:
      "Commit workspace files to the connected GitHub repository. The user must approve every commit. Use it only when the user asks for a commit.",
    risk: "external-write",
    effects: [
      "Writes a commit to your GitHub repository with your connected account.",
      "A public repository shows the commit to everyone.",
      "A commit stays in the history. It is hard to remove.",
      "keyrig writes only the files that you approve. It cannot delete a file on GitHub.",
    ],
    alwaysAsk: true,
    needsGithub: true,
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", minLength: 1, maxLength: 500, description: "The commit message." },
        branch: {
          type: "string",
          maxLength: 200,
          description: "The branch to write. Leave it out for the branch that the user set.",
        },
        files: {
          type: "array",
          maxItems: MAX_COMMIT_FILES,
          items: { type: "string", maxLength: MAX_PATH_CHARS },
          description: "Workspace paths to commit. Leave it out for every changed file.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
];

/**
 * AS-02: keyrig never reads, writes or commits a secret-like path.
 * The check is a blocklist on purpose. A blocklist is easy to read and to test.
 */
const PROTECTED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".ssh",
  ".aws",
  ".gnupg",
  ".azure",
  ".kube",
  ".docker",
]);
const PROTECTED_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".kdbx", ".ppk"];
const PROTECTED_NAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".git-credentials",
  ".htpasswd",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "credentials",
  "keyrig.vault.v1",
]);
const PROTECTED_WORDS = ["secret", "credential", "password", "passwd", "apikey", "api-key", "token"];

const PATH_PATTERN = /^[A-Za-z0-9._\-/ ]+$/;

function invalid(message: string, code = "tool_arguments_invalid"): never {
  throw KeyrigError.fromCategory("invalid_request", { code, message, action: "none" });
}

/** AS-02: a relative path with no escape and no protected part. */
export function normalizeWorkspacePath(raw: unknown): string {
  if (typeof raw !== "string") {
    invalid("The path must be text.");
  }
  const value = (raw as string).trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (value.length === 0) {
    invalid("The path is empty.");
  }
  if (value.length > MAX_PATH_CHARS) {
    invalid(`The path is longer than ${MAX_PATH_CHARS} characters.`);
  }
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    invalid("Use a relative path. An absolute path is not allowed.");
  }
  if (value.includes("\u0000")) {
    invalid("The path holds a broken character.");
  }
  if (!PATH_PATTERN.test(value)) {
    invalid("The path can use letters, digits, dots, dashes, spaces and one slash between folders.");
  }
  const parts = value.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    invalid("The path must stay inside the workspace.");
  }
  return parts.join("/");
}

/** AS-02: the reason that a path is protected, or null. */
export function protectedReason(path: string): string | null {
  const lower = path.toLowerCase();
  const parts = lower.split("/");
  for (const part of parts) {
    if (PROTECTED_SEGMENTS.has(part)) {
      return `keyrig protects the folder ${part}.`;
    }
  }
  const name = parts[parts.length - 1] ?? "";
  if (name.startsWith(".env")) {
    return "keyrig protects .env files.";
  }
  if (PROTECTED_NAMES.has(name)) {
    return `keyrig protects the file ${name}.`;
  }
  if (PROTECTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return "keyrig protects key and certificate files.";
  }
  if (PROTECTED_WORDS.some((word) => name.includes(word))) {
    return "keyrig protects a file with a secret-like name.";
  }
  return null;
}

interface FieldSchema {
  type?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  required?: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkValue(value: unknown, schema: FieldSchema | undefined, field: string): void {
  if (schema === undefined) {
    return;
  }
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        invalid(`The field ${field} must be text.`);
      }
      const text = value as string;
      if (schema.minLength !== undefined && text.length < schema.minLength) {
        invalid(`The field ${field} is too short.`);
      }
      if (schema.maxLength !== undefined && text.length > schema.maxLength) {
        invalid(`The field ${field} is longer than ${schema.maxLength} characters.`);
      }
      return;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        invalid(`The field ${field} must be a number.`);
      }
      const number = value as number;
      if (schema.minimum !== undefined && number < schema.minimum) {
        invalid(`The field ${field} is too small.`);
      }
      if (schema.maximum !== undefined && number > schema.maximum) {
        invalid(`The field ${field} is too large.`);
      }
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        invalid(`The field ${field} must be true or false.`);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        invalid(`The field ${field} must be a list.`);
      }
      const items = value as unknown[];
      if (schema.maxItems !== undefined && items.length > schema.maxItems) {
        invalid(`The field ${field} has more than ${schema.maxItems} items.`);
      }
      for (const item of items) {
        checkValue(item, schema.items, field);
      }
      return;
    }
    case "object": {
      if (!isPlainObject(value)) {
        invalid(`The field ${field} must be an object.`);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * MC-05: strict input. An unknown field is an error, not a hint. A missing
 * required field is an error. The model reads the message and can correct it.
 */
export function validateToolArguments(tool: ToolDefinition, rawArguments: string): Record<string, unknown> {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawArguments.length > 0 ? rawArguments : "{}");
  } catch {
    invalid(`The arguments for ${tool.name} are not JSON.`);
  }
  if (!isPlainObject(parsed)) {
    invalid(`The arguments for ${tool.name} must be one JSON object.`);
  }
  const args = parsed as Record<string, unknown>;
  const schema = tool.parameters as FieldSchema;
  const properties = schema.properties ?? {};
  const required = schema.required ?? [];

  for (const key of Object.keys(args)) {
    if (!(key in properties)) {
      invalid(`The field ${key} is not part of ${tool.name}.`);
    }
  }
  for (const key of required) {
    if (!(key in args)) {
      invalid(`The field ${key} is required for ${tool.name}.`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    checkValue(value, properties[key], key);
  }
  return args;
}

/** AS-01: read calls run at once. A write needs a yes unless the user allows it. */
export function requiresApproval(tool: ToolDefinition, options: { autoApproveWrites: boolean }): boolean {
  if (tool.risk === "read") {
    return false;
  }
  if (tool.alwaysAsk) {
    return true;
  }
  if (tool.risk === "write") {
    return !options.autoApproveWrites;
  }
  return true;
}

export function findTool(name: string, tools: readonly ToolDefinition[] = TOOL_SPECS): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}

export function toToolSpec(tool: ToolDefinition): ToolSpec {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

/** The tools that the user enabled, as the provider sees them. */
export function specsFor(names: readonly string[], tools: readonly ToolDefinition[] = TOOL_SPECS): ToolSpec[] {
  const wanted = new Set(names);
  return tools.filter((tool) => wanted.has(tool.name)).map(toToolSpec);
}

/** One short line for the approval card and the tool log. */
export function describeCall(tool: ToolDefinition, args: Record<string, unknown>): string {
  switch (tool.name) {
    case "write_file":
      return `Write ${String(args.path ?? "")} (${String(args.content ?? "").length} characters).`;
    case "delete_file":
      return `Delete ${String(args.path ?? "")}.`;
    case "read_file":
      return `Read ${String(args.path ?? "")}.`;
    case "list_files":
      return args.folder === undefined ? "List every workspace file." : `List ${String(args.folder)}.`;
    case "search_files":
      return `Search for "${String(args.query ?? "")}".`;
    case "create_scene":
      return `Render the scene "${String(args.title ?? "")}".`;
    case "github_commit": {
      const files = Array.isArray(args.files) ? args.files.length : 0;
      const count = files === 0 ? "the changed files" : `${files} ${files === 1 ? "file" : "files"}`;
      return `Commit ${count} to GitHub: "${String(args.message ?? "")}".`;
    }
    default:
      return `${tool.title}.`;
  }
}
