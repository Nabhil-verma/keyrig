import { KeyrigError } from "@keyrig/shared";

/**
 * PR-01: a tool runs in a sandbox with no access to the vault.
 *
 * The app builds the sandbox from the parts that a tool may use: the workspace,
 * the GitHub connection and the scene callback. The vault, the keys and the
 * passphrase are not on that list. `createToolSandbox` refuses a capability
 * object that carries one, so a later change cannot hand the vault to a tool
 * by accident.
 *
 * This is a boundary in the code, not a claim about the device owner: a person
 * with the browser storage can still read the records. The tools cannot.
 */

/** A capability name that a tool must never hold. */
export const SANDBOX_BLOCKED_MEMBERS = [
  "vault",
  "keys",
  "passphrase",
  "keyVault",
  "storage",
  "localStorage",
] as const;

function refused(member: string): KeyrigError {
  return KeyrigError.fromCategory("invalid_request", {
    code: "sandbox_vault_forbidden",
    message: `A tool cannot run with ${member}. The sandbox holds no key.`,
    retryable: false,
    action: "none",
  });
}

/**
 * The tool context. It copies the allowed capabilities and freezes the copy,
 * so a tool cannot add a member to it.
 */
export function createToolSandbox<T extends Record<string, unknown>>(capabilities: T): Readonly<T> {
  for (const member of SANDBOX_BLOCKED_MEMBERS) {
    if (member in capabilities) {
      throw refused(member);
    }
  }
  return Object.freeze({ ...capabilities });
}
