import { afterEach, describe, expect, it } from "vitest";
import { d1Store } from "./backend.mjs";
import { createSqliteD1 } from "./testSqliteD1.mjs";

const databases = [];

function openRaw() {
  const database = createSqliteD1();
  databases.push(database);
  return database;
}

const TABLE =
  "CREATE TABLE backend_accounts (username TEXT PRIMARY KEY, role TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL)";

async function insert(database, name, createdAt) {
  await database
    .prepare("INSERT INTO backend_accounts (username, role, password, created_at) VALUES (?, 'owner', 'hash', ?)")
    .bind(name, createdAt)
    .run();
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("B7 the account-name migration is case-insensitive and non-destructive", () => {
  it("moves an old mixed-case name to lower case", async () => {
    const database = openRaw();
    await database.exec(TABLE);
    await insert(database, "Alice", "2026-01-01T00:00:00.000Z");

    const store = d1Store(database);
    expect(await store.listAccounts()).toEqual([{ username: "alice", role: "owner" }]);
    expect(await store.accountByName("ALICE")).toMatchObject({ username: "alice", role: "owner" });

    const conflict = await database
      .prepare("SELECT value FROM backend_meta WHERE key = 'account_case_conflict'")
      .first();
    expect(conflict).toBeNull();
  });

  it("keeps both names and reports the conflict when two rows differ only by case", async () => {
    const database = openRaw();
    await database.exec(TABLE);
    await insert(database, "Alice", "2026-01-01T00:00:00.000Z");
    await insert(database, "alice", "2026-01-02T00:00:00.000Z");

    const store = d1Store(database);
    expect(await store.listAccounts()).toHaveLength(2);

    const names = await database.prepare("SELECT username FROM backend_accounts ORDER BY created_at").all();
    expect(names.results.map((row) => row.username)).toEqual(["Alice", "alice"]);

    const conflict = await database
      .prepare("SELECT value FROM backend_meta WHERE key = 'account_case_conflict'")
      .first();
    expect(conflict?.value).toContain("alice");
  });
});
