import { ToolRegistry } from "@keyrig/core";
import { browserStorage } from "../lib/storage";

/**
 * Phase 2: the tool records of this device.
 *
 * The record holds the user tools and the user copies of the built-in tools.
 * It stays in this browser. It holds no key (PR-01).
 */
let registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (registry === null) {
    registry = new ToolRegistry({ storage: browserStorage() });
  }
  return registry;
}
