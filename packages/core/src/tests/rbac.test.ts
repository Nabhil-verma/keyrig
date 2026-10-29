import { KeyrigError, createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { signUp } from "../accounts";
import {
  PERMISSION_KEYS,
  ROLES_STORAGE_KEY,
  assignRole,
  can,
  ensureAccountRole,
  permissionsOf,
  readAssignments,
  revokeRole,
  roleOf,
} from "../rbac";

const PASSWORD = "correct horse battery";

async function makeDevice(usernames: string[]) {
  const storage = createMemoryStorage();
  for (const username of usernames) {
    await signUp({ storage, username, password: PASSWORD, iterations: 1000 });
  }
  return storage;
}

function errorOf(task: () => unknown): KeyrigError {
  try {
    task();
  } catch (caught) {
    return caught as KeyrigError;
  }
  throw new Error("The task did not fail.");
}

describe("AC-01 the owner holds every permission key", () => {
  it("gives the owner every key and gives the other roles their own keys", () => {
    expect(permissionsOf("owner")).toEqual([...PERMISSION_KEYS]);
    for (const key of PERMISSION_KEYS) {
      expect(can("owner", key)).toBe(true);
    }
    expect(can("admin", "roles.assign")).toBe(true);
    expect(can("member", "chat.send")).toBe(true);
    expect(can("member", "keys.manage")).toBe(true);
    expect(can("member", "roles.assign")).toBe(false);
    expect(can("viewer", "chat.send")).toBe(false);
    expect(can("viewer", "keys.manage")).toBe(false);
    expect(can(null, "chat.send")).toBe(false);
  });
});

describe("AC-03 the first account becomes the owner", () => {
  it("makes the oldest account the owner and a later account a viewer", async () => {
    const storage = await makeDevice(["alice", "bob"]);

    expect(ensureAccountRole({ storage }, "alice")).toBe("owner");
    expect(ensureAccountRole({ storage }, "bob")).toBe("viewer");
    expect(roleOf({ storage }, "alice")).toBe("owner");
    expect(roleOf({ storage }, "bob")).toBe("viewer");
  });

  it("writes one record for each account and does not duplicate it", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");

    expect(readAssignments({ storage }).map((item) => item.username)).toEqual(["alice", "bob"]);
    expect(JSON.parse(storage.getItem(ROLES_STORAGE_KEY) ?? "{}")).toMatchObject({ schemaVersion: 1 });
  });
});

describe("AC-04 a role change needs the roles.assign key", () => {
  it("rejects a member and gives a clear reason", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");

    const error = errorOf(() => assignRole({ storage, actor: "bob", target: "alice", role: "viewer" }));
    expect(error).toBeInstanceOf(KeyrigError);
    expect(error.code).toBe("role_forbidden");
    expect(error.category).toBe("invalid_request");
    expect(error.message).toContain("Your role cannot change roles.");
    expect(roleOf({ storage }, "alice")).toBe("owner");
  });

  it("stops an admin from granting the owner role or another admin role", async () => {
    const storage = await makeDevice(["alice", "bob", "carol"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");
    ensureAccountRole({ storage }, "carol");
    assignRole({ storage, actor: "alice", target: "bob", role: "admin" });

    expect(errorOf(() => assignRole({ storage, actor: "bob", target: "carol", role: "owner" })).message).toContain(
      "Only an owner can grant the owner role.",
    );
    expect(errorOf(() => assignRole({ storage, actor: "bob", target: "carol", role: "admin" })).message).toContain(
      "You cannot grant a role at or above your own.",
    );
    expect(assignRole({ storage, actor: "bob", target: "carol", role: "member" })).toHaveLength(3);
    expect(roleOf({ storage }, "carol")).toBe("member");
  });

  it("stops every account from changing its own role", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");

    expect(errorOf(() => assignRole({ storage, actor: "alice", target: "alice", role: "viewer" })).message).toContain(
      "You cannot change your own role.",
    );
    expect(roleOf({ storage }, "alice")).toBe("owner");
  });

  it("rejects an unknown account and an unknown role", async () => {
    const storage = await makeDevice(["alice"]);
    ensureAccountRole({ storage }, "alice");

    expect(errorOf(() => assignRole({ storage, actor: "alice", target: "nobody", role: "admin" })).message).toContain(
      "That account does not exist on this device.",
    );
    expect(
      errorOf(() => assignRole({ storage, actor: "alice", target: "bob", role: "root" as never })).message,
    ).toContain("That role does not exist.");
  });
});

describe("AC-05 the last owner keeps the owner role", () => {
  it("stops an admin from demoting the only owner", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");
    assignRole({ storage, actor: "alice", target: "bob", role: "admin" });

    expect(errorOf(() => revokeRole({ storage, actor: "bob", target: "alice" })).message).toContain(
      "The last owner keeps the owner role.",
    );
    expect(roleOf({ storage }, "alice")).toBe("owner");
  });

  it("lets an owner step down when a second owner exists", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");
    assignRole({ storage, actor: "alice", target: "bob", role: "owner" });

    expect(revokeRole({ storage, actor: "alice", target: "bob" })).toHaveLength(2);
    expect(roleOf({ storage }, "bob")).toBe("viewer");
    expect(roleOf({ storage }, "alice")).toBe("owner");
  });
});

describe("AC-06 revokeRole falls back to the viewer role", () => {
  it("sets the viewer role and keeps the record", async () => {
    const storage = await makeDevice(["alice", "bob"]);
    ensureAccountRole({ storage }, "alice");
    ensureAccountRole({ storage }, "bob");
    assignRole({ storage, actor: "alice", target: "bob", role: "admin" });

    revokeRole({ storage, actor: "alice", target: "bob" });
    expect(roleOf({ storage }, "bob")).toBe("viewer");
    expect(readAssignments({ storage })).toHaveLength(2);
  });
});
