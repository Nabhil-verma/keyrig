import { publishProblem } from "@keyrig/shared";
import {
  TOOL_PERMISSIONS,
  type Tool,
  type ToolPermission,
} from "@keyrig/core";
import type { BackendToolDefinition, PublishToolInput, PublishedToolRow } from "../services/backendClient";

/**
 * Phase 4: the pure parts of the marketplace.
 *
 * A published tool holds no key, no chat, no cost and no usage (PR-01, PR-05).
 * The publish scan runs before the item leaves this browser, and the backend
 * runs the same scan again.
 */

export function permissionList(values: readonly string[]): ToolPermission[] {
  const valid = values.filter(
    (value): value is ToolPermission =>
      value === "none" || (TOOL_PERMISSIONS as readonly string[]).includes(value),
  );
  return valid.length > 0 ? valid.slice(0, 4) : ["none"];
}

/** A published row without permissions falls back to its risk level. */
export function marketplacePermissions(entry: PublishedToolRow): ToolPermission[] {
  if (entry.permissions.length > 0) {
    return permissionList(entry.permissions);
  }
  if (entry.risk === "external-write") {
    return ["network"];
  }
  if (entry.risk === "read") {
    return ["none"];
  }
  return ["files"];
}

export function definitionFromTool(tool: Tool): BackendToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    permissions: [...tool.permissions],
    inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
    script: tool.script,
  };
}

/** The item that the person sends on purpose. It holds no key and no input data. */
export function publishedFromTool(tool: Tool, tags: readonly string[] = []): PublishToolInput {
  return {
    name: tool.name,
    description: tool.description,
    permissions: [...tool.permissions],
    version: tool.version,
    tags: tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0).slice(0, 8),
    definition: definitionFromTool(tool),
  };
}

/**
 * The reason that an entry cannot be installed, or null.
 *
 * An entry needs a definition with a name, a description, a schema and a
 * script. The scan refuses a definition that holds a key (PR-01).
 */
export function installProblem(entry: PublishedToolRow): string | null {
  const definition = entry.definition;
  if (definition === null) {
    return "This entry has no tool code, so keyrig cannot install it.";
  }
  if (typeof definition.name !== "string" || definition.name.trim().length === 0) {
    return "This entry has no tool name, so keyrig cannot install it.";
  }
  if (typeof definition.description !== "string" || definition.description.trim().length === 0) {
    return "This entry has no description, so keyrig cannot install it.";
  }
  if (typeof definition.script !== "string" || definition.script.trim().length === 0) {
    return "This entry has no script, so keyrig cannot install it.";
  }
  if (
    definition.inputSchema === null ||
    typeof definition.inputSchema !== "object" ||
    Array.isArray(definition.inputSchema)
  ) {
    return "This entry has no input schema, so keyrig cannot install it.";
  }
  return publishProblem(definition);
}

export function publishToolProblem(tool: Tool): string | null {
  return publishProblem(publishedFromTool(tool));
}
