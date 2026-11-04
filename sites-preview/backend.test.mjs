import { describe, expect, it } from "vitest";
import {
  BACKEND_FIELDS,
  accountProblem,
  backendRoute,
  envelopeProblem,
  findSecret,
  hashPassword,
  holdsKey,
  roleProblem,
  routeWithStore,
  toolProblem,
  verifyPassword,
} from "./backend.mjs";

const OPENAI_KEY = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

/** The same shape as the D1 store, in memory, so a route test needs no database. */
function memoryStore() {
  const accounts = new Map();
  const sessions = new Map();
  const tools = [];
  const requests = [];
  const votes = new Map();
  return {
    accounts,
    sessions,
    tools,
    requests,
    votes,
    async accountByName(username) {
      const row = accounts.get(username);
      return row === undefined ? null : { ...row };
    },
    async countAccounts() {
      return accounts.size;
    },
    async createAccount({ username, role, password }) {
      accounts.set(username, { username, role, password });
    },
    async setRole(username, role) {
      const row = accounts.get(username);
      if (row !== undefined) {
        row.role = role;
      }
    },
    async ownerCount() {
      return [...accounts.values()].filter((row) => row.role === "owner").length;
    },
    async createSession({ id, username, expires }) {
      sessions.set(id, { username, expires });
    },
    async sessionOwner(id, now) {
      const row = sessions.get(id);
      return row !== undefined && row.expires > now ? row.username : null;
    },
    async listTools(limit) {
      return tools.slice(0, limit);
    },
    async createTool(row) {
      tools.push({ ...row });
    },
    async createRequest(row) {
      requests.push({ ...row });
    },
    async saveVote(vote) {
      votes.set(`${vote.username}|${vote.toolId}`, { ...vote });
    },
  };
}

function post(path, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  return new Request(`https://keyrig.test${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function get(path, cookie) {
  return new Request(`https://keyrig.test${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}

function route(request, store) {
  return routeWithStore(request, {}, new URL(request.url).pathname, store);
}

function cookieOf(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

async function signedUp(store, username, password = "correct-horse") {
  const response = await route(post("/api/backend/account?mode=sign-up", { account: { username, password } }), store);
  return { response, cookie: cookieOf(response) };
}

describe("PR-01 no key reaches the backend", () => {
  it("refuses a body that carries a key-like string", () => {
    const refusal = envelopeProblem({ votes: { toolId: OPENAI_KEY, up: true } });

    expect(refusal).not.toBeNull();
    expect(refusal.code).toBe("key_in_body");
    expect(refusal.message).not.toContain(OPENAI_KEY);
    expect(findSecret({ votes: { toolId: OPENAI_KEY } })).toBe("votes.toolId");
  });

  it("refuses a field that is not on the allowlist", () => {
    const refusal = envelopeProblem({ account: { username: "alice" }, chats: [{ title: "mine" }] });

    expect(refusal.code).toBe("field_not_allowed");
    expect(refusal.message).toContain("chats");
    expect(BACKEND_FIELDS).toEqual(["account", "publishedTools", "featureRequests", "votes"]);
  });

  it("refuses a published tool that holds a key", async () => {
    const store = memoryStore();
    const { cookie } = await signedUp(store, "alice");

    const response = await route(
      post(
        "/api/backend/tools",
        {
          publishedTools: {
            name: "deploy",
            risk: "external-write",
            description: "Deploy one build.",
            command: `curl -H "authorization: Bearer ${OPENAI_KEY}" https://example.test`,
          },
        },
        cookie,
      ),
      store,
    );

    // The envelope scan refuses the body before the publish route runs, and the
    // publish scan refuses the item on its own. Either way no row is written.
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("key_in_body");
    expect(toolProblem({ name: "deploy", risk: "read", description: `run ${OPENAI_KEY}` })).toContain(
      "holds a key",
    );
    expect(store.tools).toHaveLength(0);
    expect(JSON.stringify(store.tools)).not.toContain(OPENAI_KEY);
  });

  it("refuses a field with a secret-like name in a tool", () => {
    expect(findSecret({ name: "lint", apiKey: "value" })).toBe("apiKey");
    expect(toolProblem({ name: "lint", risk: "read", description: "Lint.", token: "value" })).toContain(
      "holds a key",
    );
  });

  it("refuses a key sent as the account password", () => {
    const refusal = envelopeProblem({ account: { username: "alice", password: OPENAI_KEY } });

    expect(refusal.code).toBe("key_in_body");
    expect(refusal.message).not.toContain(OPENAI_KEY);
    expect(envelopeProblem({ account: { username: "alice", password: "correct-horse" } })).toBeNull();
  });

  it("finds a key-like string without a registered secret", () => {
    expect(holdsKey(OPENAI_KEY)).toBe(true);
    expect(holdsKey("The build finished in 2.4 seconds.")).toBe(false);
  });
});

describe("PR-05 the backend never receives chats, prompts, cost, usage or a streak", () => {
  it("drops no field silently: an extra field is an error", () => {
    for (const body of [
      { account: { username: "alice" }, messages: [{ role: "user", content: "private" }] },
      { account: { username: "alice" }, cost: 0.42 },
      { account: { username: "alice" }, usage: { inputTokens: 10 } },
      { account: { username: "alice" }, streaks: [{ day: "2026-11-04" }] },
    ]) {
      expect(envelopeProblem(body).code).toBe("field_not_allowed");
    }
  });

  it("accepts the four fields that the user sends on purpose", () => {
    expect(
      envelopeProblem({
        account: { username: "alice" },
        publishedTools: { name: "lint" },
        featureRequests: { title: "Add a cost export" },
        votes: { toolId: "lint", up: true },
      }),
    ).toBeNull();
  });
});

describe("D-07 the optional backend holds accounts, roles, the marketplace and feature requests", () => {
  it("refuses every call when the site has no database", async () => {
    const response = await backendRoute(
      post("/api/backend/account?mode=sign-up", { account: { username: "alice", password: "correct-horse" } }),
      {},
      "/api/backend/account",
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("no_database");
  });

  it("makes the first account the owner and the next account a viewer", async () => {
    const store = memoryStore();
    const first = await signedUp(store, "alice");
    const second = await signedUp(store, "bob");

    expect((await first.response.json()).account.role).toBe("owner");
    expect((await second.response.json()).account.role).toBe("viewer");
    expect(store.accounts.get("alice").role).toBe("owner");
  });

  it("keeps the password out of the row", async () => {
    const store = memoryStore();
    await signedUp(store, "alice", "correct-horse-battery");

    const row = store.accounts.get("alice");
    expect(row.password).not.toContain("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", row.password)).toBe(true);
    expect(await verifyPassword("wrong-password", row.password)).toBe(false);
  });

  it("signs in with the password and refuses a wrong one", async () => {
    const store = memoryStore();
    await signedUp(store, "alice", "correct-horse-battery");

    const wrong = await route(
      post("/api/backend/account?mode=sign-in", { account: { username: "alice", password: "not-the-password" } }),
      store,
    );
    expect(wrong.status).toBe(403);

    const right = await route(
      post("/api/backend/account?mode=sign-in", {
        account: { username: "alice", password: "correct-horse-battery" },
      }),
      store,
    );
    expect(right.status).toBe(200);
    expect(right.headers.get("set-cookie")).toContain("keyrig_backend=");
  });

  it("reads the account back with the session cookie", async () => {
    const store = memoryStore();
    const { cookie } = await signedUp(store, "alice");

    const response = await route(get("/api/backend/account", cookie), store);
    expect(await response.json()).toEqual({ account: { username: "alice", role: "owner" } });

    const anonymous = await route(get("/api/backend/account"), store);
    expect(anonymous.status).toBe(401);
  });

  it("publishes a tool, then lists it for everyone", async () => {
    const store = memoryStore();
    const { cookie } = await signedUp(store, "alice");

    const published = await route(
      post(
        "/api/backend/tools",
        { publishedTools: { name: "lint", risk: "read", description: "Run the linter on one file." } },
        cookie,
      ),
      store,
    );
    expect(published.status).toBe(201);

    const listed = await route(get("/api/backend/tools"), store);
    const body = await listed.json();
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("lint");
    expect(body.tools[0].publisher).toBe("alice");
  });

  it("stores a feature request and a vote", async () => {
    const store = memoryStore();
    const { cookie } = await signedUp(store, "alice");

    const request = await route(
      post("/api/backend/requests", { featureRequests: { title: "Add a cost export" } }, cookie),
      store,
    );
    expect(request.status).toBe(201);
    expect(store.requests[0].title).toBe("Add a cost export");

    const vote = await route(post("/api/backend/votes", { votes: { toolId: "lint", up: true } }, cookie), store);
    expect(vote.status).toBe(200);
    expect(store.votes.get("alice|lint").up).toBe(true);
  });

  it("lets an owner change a role and refuses a change of your own role", async () => {
    const store = memoryStore();
    const owner = await signedUp(store, "alice");
    const viewer = await signedUp(store, "bob");

    const granted = await route(
      post("/api/backend/roles", { account: { username: "bob", role: "member" } }, owner.cookie),
      store,
    );
    expect(granted.status).toBe(200);
    expect(store.accounts.get("bob").role).toBe("member");

    const selfChange = await route(
      post("/api/backend/roles", { account: { username: "bob", role: "owner" } }, viewer.cookie),
      store,
    );
    expect(selfChange.status).toBe(403);
    expect((await selfChange.json()).error.message).toBe("You cannot change your own role.");
    expect(store.accounts.get("bob").role).toBe("member");
  });

  it("keeps the role rules in one place", () => {
    const base = { actor: "alice", target: "bob", actorRole: "owner", targetRole: "viewer", ownerCount: 1 };

    expect(roleProblem({ ...base, wanted: "member" })).toBeNull();
    expect(roleProblem({ ...base, wanted: "owner", actorRole: "admin" })).toBe(
      "Only an owner can grant the owner role.",
    );
    expect(roleProblem({ ...base, wanted: "viewer", targetRole: "owner" })).toBe(
      "The last owner keeps the owner role.",
    );
    expect(roleProblem({ ...base, wanted: "member", actorRole: "viewer" })).toContain("cannot change roles");
    expect(roleProblem({ ...base, wanted: "member", target: "alice" })).toBe("You cannot change your own role.");
  });

  it("refuses a short password and a short account name", () => {
    expect(accountProblem({ username: "alice", password: "short" })).toContain("at least 8");
    expect(accountProblem({ username: "a", password: "correct-horse" })).toContain("3 to 32");
    expect(accountProblem({ username: "alice", password: "correct-horse" })).toBeNull();
  });

  it("hashes two passwords with two different salts", async () => {
    const first = await hashPassword("correct-horse");
    const second = await hashPassword("correct-horse");

    expect(first).not.toBe(second);
    expect(await verifyPassword("correct-horse", first)).toBe(true);
  });
});
