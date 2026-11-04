import { afterEach, describe, expect, it } from "vitest";
import { d1Store } from "./backend.mjs";
import { createSqliteD1 } from "./testSqliteD1.mjs";

const databases = [];

function openStore() {
  const database = createSqliteD1();
  databases.push(database);
  return { database, store: d1Store(database) };
}

async function rows(database, sql, ...args) {
  return (await database.prepare(sql).bind(...args).all()).results;
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("D-07 the D1 store keeps the backend rows", () => {
  it("creates the schema and the read indexes in one script", async () => {
    const { database, store } = openStore();
    await store.listTools(1);

    const tables = (await rows(database, "SELECT name FROM sqlite_master WHERE type = 'table'")).map(
      (row) => row.name,
    );
    expect(tables).toEqual(
      expect.arrayContaining([
        "backend_accounts",
        "backend_sessions",
        "backend_tools",
        "backend_tool_data",
        "backend_requests",
        "backend_request_meta",
        "backend_request_votes",
        "backend_votes",
      ]),
    );

    for (const [table, index] of [
      ["backend_accounts", "backend_accounts_created"],
      ["backend_sessions", "backend_sessions_expires"],
      ["backend_tools", "backend_tools_created"],
      ["backend_requests", "backend_requests_created"],
      ["backend_request_votes", "backend_request_votes_request"],
      ["backend_votes", "backend_votes_tool"],
    ]) {
      const names = (await rows(database, `PRAGMA index_list('${table}')`)).map((row) => row.name);
      expect(names).toContain(index);
    }
  });

  it("makes the first account the owner and the next account a viewer", async () => {
    const { store } = openStore();

    const first = await store.createAccount({ username: "alice", password: "hash-a" });
    const second = await store.createAccount({ username: "bob", password: "hash-b" });

    expect(first).toEqual({ username: "alice", role: "owner" });
    expect(second).toEqual({ username: "bob", role: "viewer" });
    expect(await store.createAccount({ username: "alice", password: "hash-c" })).toBeNull();
    expect(await store.ownerCount()).toBe(1);
    expect(await store.listAccounts()).toEqual([
      { username: "alice", role: "owner" },
      { username: "bob", role: "viewer" },
    ]);
  });

  it("writes a tool and its data together, and rolls the pair back on failure", async () => {
    const { database, store } = openStore();
    const tool = {
      id: "tool-1",
      name: "lint",
      publisher: "alice",
      risk: "read",
      description: "Lint one file.",
      createdAt: "2026-11-04T00:00:00.000Z",
      permissions: ["none"],
      version: 2,
      tags: ["text"],
      definition: {
        name: "lint",
        description: "Lint one file.",
        script: "return { ok: true };",
      },
    };

    await store.createTool(tool);
    const [stored] = await store.listTools(10);
    expect(stored.name).toBe("lint");
    expect(JSON.parse(stored.definition).script).toBe(tool.definition.script);
    expect(JSON.parse(stored.permissions)).toEqual(["none"]);
    expect(stored.version).toBe(2);

    await expect(store.createTool(tool)).rejects.toThrow();
    expect(await store.listTools(10)).toHaveLength(1);
    expect(Number((await rows(database, "SELECT COUNT(*) AS n FROM backend_tool_data"))[0].n)).toBe(1);
  });

  it("stores a request with its vote and status", async () => {
    const { store } = openStore();
    await store.createRequest({
      id: "request-1",
      username: "alice",
      title: "Add a cost export",
      detail: "A CSV file.",
      createdAt: "2026-11-04T00:00:00.000Z",
    });

    expect(await store.setRequestStatus("missing", "planned", "No row.")).toBe(false);
    expect(await store.setRequestStatus("request-1", "planned", "Next release.")).toBe(true);
    expect(
      await store.setRequestVote({
        username: "bob",
        requestId: "request-1",
        up: true,
        createdAt: "2026-11-04T00:01:00.000Z",
      }),
    ).toBe(true);

    const [stored] = await store.listRequests(10, "bob");
    expect(stored.title).toBe("Add a cost export");
    expect(stored.status).toBe("planned");
    expect(stored.status_reason).toBe("Next release.");
    expect(Number(stored.votes)).toBe(1);
    expect(Number(stored.voted)).toBe(1);
  });

  it("prunes an expired session when it creates a new one", async () => {
    const { database, store } = openStore();
    await store.listTools(1);
    const now = Math.floor(Date.now() / 1000);
    database
      .prepare("INSERT INTO backend_sessions (id, username, expires) VALUES (?, ?, ?)")
      .bind("old", "alice", now - 1)
      .run();

    await store.createSession({ id: "new", username: "alice", expires: now + 60 });

    expect((await rows(database, "SELECT id FROM backend_sessions")).map((row) => row.id)).toEqual(["new"]);
    expect(await store.sessionOwner("new", now)).toBe("alice");
    await store.endSession("new");
    expect(await store.sessionOwner("new", now)).toBeNull();
  });

  it("upserts a tool vote for the same account", async () => {
    const { database, store } = openStore();
    await store.saveVote({
      username: "alice",
      toolId: "tool-1",
      up: true,
      createdAt: "2026-11-04T00:00:00.000Z",
    });
    await store.saveVote({
      username: "alice",
      toolId: "tool-1",
      up: false,
      createdAt: "2026-11-04T00:01:00.000Z",
    });

    const [vote] = await rows(
      database,
      "SELECT up FROM backend_votes WHERE username = ? AND tool_id = ?",
      "alice",
      "tool-1",
    );
    expect(vote.up).toBe(0);
  });
});
