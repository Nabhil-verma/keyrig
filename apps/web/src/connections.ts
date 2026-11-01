import { normalizeRecoveryEmail } from "@keyrig/core";
import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";

/**
 * The profile of one account on this device.
 *
 * The recovery email and the GitHub login are links, not sign-in factors. The
 * GitHub token is not here: it lives in the encrypted vault. This record holds
 * only labels and the switch that allows the AI to commit.
 */

export const CONNECTIONS_STORAGE_KEY = "keyrig.connections.v1";
export const CONNECTIONS_SCHEMA_VERSION = 1;

export interface AccountConnections {
  recoveryEmail: string | null;
  githubLogin: string | null;
  /** "owner/repo". An empty string means no repository. */
  githubRepo: string;
  githubBranch: string;
  /** The profile switch that allows the AI to commit. */
  commitPermit: boolean;
}

export const DEFAULT_CONNECTIONS: AccountConnections = {
  recoveryEmail: null,
  githubLogin: null,
  githubRepo: "",
  githubBranch: "main",
  commitPermit: false,
};

function gmailOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    return normalizeRecoveryEmail(value);
  } catch {
    return null;
  }
}

export function normalizeConnections(input: unknown): AccountConnections {
  const source = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const login =
    typeof source.githubLogin === "string" && source.githubLogin.trim().length > 0
      ? source.githubLogin.trim().slice(0, 80)
      : null;
  const repo = typeof source.githubRepo === "string" ? source.githubRepo.trim().slice(0, 140) : "";
  const branch =
    typeof source.githubBranch === "string" && source.githubBranch.trim().length > 0
      ? source.githubBranch.trim().slice(0, 200)
      : DEFAULT_CONNECTIONS.githubBranch;
  return {
    recoveryEmail: gmailOrNull(source.recoveryEmail),
    githubLogin: login,
    githubRepo: repo,
    githubBranch: branch,
    // A commit needs an account and a repository.
    commitPermit: source.commitPermit === true && login !== null && repo.length > 0,
  };
}

export function readConnections(storage: StorageLike): AccountConnections {
  let raw: string | null;
  try {
    raw = storage.getItem(CONNECTIONS_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_CONNECTIONS };
  }
  if (!raw) {
    return { ...DEFAULT_CONNECTIONS };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_CONNECTIONS };
  }
  if (!isVersionedDocument(parsed) || parsed.schemaVersion !== CONNECTIONS_SCHEMA_VERSION) {
    return { ...DEFAULT_CONNECTIONS };
  }
  return normalizeConnections(parsed.data);
}

export function writeConnections(storage: StorageLike, patch: Partial<AccountConnections>): AccountConnections {
  const next = normalizeConnections({ ...readConnections(storage), ...patch });
  try {
    storage.setItem(
      CONNECTIONS_STORAGE_KEY,
      JSON.stringify(createDocument(CONNECTIONS_SCHEMA_VERSION, next)),
    );
  } catch {
    // A full storage must not stop the profile form.
  }
  return next;
}
