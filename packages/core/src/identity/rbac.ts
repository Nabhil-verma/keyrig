import { KeyrigError, createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { listAccounts, normalizeUsername } from "./accounts";

/**
 * AC-01 to AC-06: role-based access control on this device.
 *
 * The permission keys are the contract. A feature checks one key. The role
 * table maps a role to its keys. The owner holds every key and bypasses the
 * checks. An account without a role record has the viewer role.
 *
 * The records stay in this browser. keyrig has no server, so a person with the
 * browser storage can change them. The checks stop mistakes and they show the
 * intent. They are not a security boundary against the device owner.
 */

export const ROLES_STORAGE_KEY = "keyrig.roles.v1";
export const ROLES_SCHEMA_VERSION = 1;

/** AC-01: the permission keys. Each gate in the app uses one of these keys. */
export const PERMISSION_KEYS = [
  "chat.send",
  "keys.manage",
  "route.manage",
  "arena.run",
  "roles.assign",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** The feature that each permission key controls. */
export const PERMISSION_FEATURES: Record<PermissionKey, string> = {
  "chat.send": "Send a prompt and stop a stream",
  "keys.manage": "Add, replace and delete a key",
  "route.manage": "Choose the provider, the model, the key and the base URL",
  "arena.run": "Run one prompt on several models",
  "roles.assign": "Grant and revoke a role",
};

export const ROLE_IDS = ["owner", "admin", "member", "viewer"] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const ROLE_LABELS: Record<RoleId, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/** A higher rank holds more access. Only the owner grants a role at its own rank. */
export const ROLE_RANK: Record<RoleId, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  viewer: 0,
};

/** AC-02: the owner holds every key. The other roles hold the listed keys. */
export const ROLE_PERMISSIONS: Record<RoleId, readonly PermissionKey[]> = {
  owner: PERMISSION_KEYS,
  admin: ["chat.send", "keys.manage", "route.manage", "arena.run", "roles.assign"],
  member: ["chat.send", "keys.manage", "route.manage", "arena.run"],
  viewer: [],
};

export interface RoleAssignment {
  username: string;
  role: RoleId;
  updatedAt: string;
}

export interface RoleStoreOptions {
  storage: StorageLike;
  now?: () => number;
}

function forbidden(message: string): KeyrigError {
  return KeyrigError.fromCategory("invalid_request", {
    code: "role_forbidden",
    message,
    retryable: false,
    action: "none",
  });
}

export function isRole(value: unknown): value is RoleId {
  return typeof value === "string" && (ROLE_IDS as readonly string[]).includes(value);
}

export function permissionsOf(role: RoleId): readonly PermissionKey[] {
  return ROLE_PERMISSIONS[role];
}

/** The owner holds every key. An account without a role holds no key. */
export function can(role: RoleId | null | undefined, key: PermissionKey): boolean {
  return role !== null && role !== undefined && ROLE_PERMISSIONS[role].includes(key);
}

function readRaw(options: RoleStoreOptions): RoleAssignment[] {
  let raw: string | null;
  try {
    raw = options.storage.getItem(ROLES_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVersionedDocument(parsed) || parsed.schemaVersion !== ROLES_SCHEMA_VERSION) {
      return [];
    }
    if (!Array.isArray(parsed.data)) {
      return [];
    }
    return (parsed.data as RoleAssignment[]).filter(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.username === "string" &&
        isRole(item.role) &&
        typeof item.updatedAt === "string",
    );
  } catch {
    return [];
  }
}

function writeRaw(options: RoleStoreOptions, assignments: RoleAssignment[]): void {
  try {
    options.storage.setItem(
      ROLES_STORAGE_KEY,
      JSON.stringify(createDocument(ROLES_SCHEMA_VERSION, assignments)),
    );
  } catch {
    throw forbidden("keyrig cannot save the role. The browser storage is full or blocked.");
  }
}

export function readAssignments(options: RoleStoreOptions): RoleAssignment[] {
  return readRaw(options);
}

/** The role of one account, or null when the account has no record. */
export function roleOf(options: RoleStoreOptions, username: string): RoleId | null {
  const wanted = normalizeUsername(username);
  return readRaw(options).find((item) => normalizeUsername(item.username) === wanted)?.role ?? null;
}

/**
 * AC-03: give an account its role. The first account on the device becomes the
 * owner. A later account starts as a viewer, so it needs a grant from an owner.
 */
export function ensureAccountRole(options: RoleStoreOptions, username: string): RoleId {
  const wanted = normalizeUsername(username);
  const assignments = readRaw(options);
  const found = assignments.find((item) => normalizeUsername(item.username) === wanted);
  if (found) {
    return found.role;
  }

  const hasOwner = assignments.some((item) => item.role === "owner");
  const isOldest = normalizeUsername(listAccounts(options.storage)[0]?.username ?? "") === wanted;
  const role: RoleId = !hasOwner && isOldest ? "owner" : "viewer";
  const at = new Date((options.now ?? Date.now)()).toISOString();
  writeRaw(options, [...assignments, { username: wanted, role, updatedAt: at }]);
  return role;
}

export interface AssignRoleInput extends RoleStoreOptions {
  actor: string;
  target: string;
  role: RoleId;
}

/**
 * AC-04 and AC-05: grant a role.
 *
 * - A person without `roles.assign` cannot change a role.
 * - Nobody changes their own role. This stops self-elevation.
 * - Only an owner grants the owner role.
 * - A person grants only a role below their own rank.
 * - The last owner keeps the owner role.
 */
export function assignRole(input: AssignRoleInput): RoleAssignment[] {
  const actor = normalizeUsername(input.actor);
  const target = normalizeUsername(input.target);
  const assignments = readRaw(input);
  const actorRole = assignments.find((item) => item.username === actor)?.role ?? null;

  if (!actorRole || !can(actorRole, "roles.assign")) {
    throw forbidden("Your role cannot change roles. Ask an owner to change your role.");
  }
  if (!isRole(input.role)) {
    throw forbidden("That role does not exist.");
  }
  if (actor === target) {
    throw forbidden("You cannot change your own role.");
  }
  if (!listAccounts(input.storage).some((account) => normalizeUsername(account.username) === target)) {
    throw forbidden("That account does not exist on this device.");
  }
  if (input.role === "owner" && actorRole !== "owner") {
    throw forbidden("Only an owner can grant the owner role.");
  }
  if (actorRole !== "owner" && ROLE_RANK[input.role] >= ROLE_RANK[actorRole]) {
    throw forbidden("You cannot grant a role at or above your own.");
  }

  const current = assignments.find((item) => item.username === target)?.role ?? "viewer";
  if (current === "owner" && input.role !== "owner") {
    const owners = assignments.filter((item) => item.role === "owner").length;
    if (owners <= 1) {
      throw forbidden("The last owner keeps the owner role.");
    }
  }

  const at = new Date((input.now ?? Date.now)()).toISOString();
  const next = assignments.some((item) => item.username === target)
    ? assignments.map((item) =>
        item.username === target ? { username: target, role: input.role, updatedAt: at } : item,
      )
    : [...assignments, { username: target, role: input.role, updatedAt: at }];
  writeRaw(input, next);
  return next;
}

/** AC-06: revoke a role. The account falls back to the viewer role. */
export function revokeRole(input: Omit<AssignRoleInput, "role">): RoleAssignment[] {
  return assignRole({ ...input, role: "viewer" });
}
