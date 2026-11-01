import { useSyncExternalStore } from "react";
import { createMemoryStorage, type StorageLike } from "@keyrig/shared";

/**
 * AS-01 and AS-06: the agent settings of this device.
 *
 * The agent is off by default. The model gets only the tools that the user
 * turned on. A delete and a commit always ask, even with auto approval on.
 * The risk acknowledgement is versioned, so a later build asks again when a
 * tool changes.
 */

export const AGENT_SETTINGS_STORAGE_KEY = "keyrig.agent.v1";
export const AGENT_SETTINGS_SCHEMA_VERSION = 1;
/** Bump this number when the risk of a tool changes, so the user reads it again. */
export const AGENT_RISK_VERSION = 1;

export const READ_TOOLS: readonly string[] = ["list_files", "read_file", "search_files", "create_scene"];

export interface AgentSettings {
  enabled: boolean;
  enabledTools: string[];
  autoApproveWrites: boolean;
  /** 0 means the user has not read the risk list for this version. */
  acknowledgedVersion: number;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  enabledTools: [...READ_TOOLS],
  autoApproveWrites: false,
  acknowledgedVersion: 0,
};

export function normalizeAgentSettings(input: unknown): AgentSettings {
  const source = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const enabledTools = Array.isArray(source.enabledTools)
    ? [...new Set(source.enabledTools.filter((item): item is string => typeof item === "string"))].slice(0, 24)
    : [...DEFAULT_AGENT_SETTINGS.enabledTools];
  const acknowledged =
    typeof source.acknowledgedVersion === "number" && Number.isFinite(source.acknowledgedVersion)
      ? Math.max(0, Math.floor(source.acknowledgedVersion))
      : 0;
  return {
    enabled: source.enabled === true,
    enabledTools,
    autoApproveWrites: source.autoApproveWrites === true,
    acknowledgedVersion: acknowledged,
  };
}

function deviceStorage(): StorageLike {
  try {
    const probe = "keyrig.agent.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

const storage = deviceStorage();
const listeners = new Set<() => void>();
let snapshot: AgentSettings | null = null;

function read(): AgentSettings {
  let parsed: unknown = null;
  try {
    const raw = storage.getItem(AGENT_SETTINGS_STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const body =
    parsed !== null &&
    typeof parsed === "object" &&
    (parsed as { schemaVersion?: unknown }).schemaVersion === AGENT_SETTINGS_SCHEMA_VERSION
      ? (parsed as { data?: unknown }).data
      : null;
  return normalizeAgentSettings(body);
}

export function getAgentSettings(): AgentSettings {
  if (snapshot === null) {
    snapshot = read();
  }
  return snapshot;
}

export function subscribeAgentSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function writeAgentSettings(patch: Partial<AgentSettings>): AgentSettings {
  snapshot = normalizeAgentSettings({ ...getAgentSettings(), ...patch });
  try {
    storage.setItem(
      AGENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: AGENT_SETTINGS_SCHEMA_VERSION,
        appliedMigrations: [],
        data: snapshot,
      }),
    );
  } catch {
    // A full storage must not stop a settings change.
  }
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
}

export function useAgentSettings(): AgentSettings {
  return useSyncExternalStore(subscribeAgentSettings, getAgentSettings, getAgentSettings);
}

/** The tools that the agent may use now. The master switch wins. */
export function activeTools(settings: AgentSettings): string[] {
  if (!settings.enabled || settings.acknowledgedVersion < AGENT_RISK_VERSION) {
    return [];
  }
  return settings.enabledTools;
}
