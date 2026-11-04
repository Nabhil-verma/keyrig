import { afterEach, describe, expect, it } from "vitest";
import { createSqliteD1 } from "./testSqliteD1.mjs";
import worker from "./worker.mjs";

const databases = [];

function assets() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/") {
        return new Response("<!doctype html><title>keyrig</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("missing", { status: 404 });
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

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close();
  }
});

describe("D-07 the Worker attaches the backend when DB is present", () => {
  it("returns 503 for the backend without a DB binding", async () => {
    const response = await worker.fetch(get("/api/backend/account"), { ASSETS: assets() });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("no_database");
  });

  it("runs sign-up, account and marketplace calls through the Worker and SQLite", async () => {
    const database = createSqliteD1();
    databases.push(database);
    const env = { DB: database, ASSETS: assets(), BACKEND_SESSION_SALT: "test-salt" };

    const signUp = await worker.fetch(
      post("/api/backend/account?mode=sign-up", {
        account: { username: "alice", password: "correct-horse" },
      }),
      env,
    );
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers.get("set-cookie").split(";")[0];

    const account = await worker.fetch(get("/api/backend/account", cookie), env);
    expect(await account.json()).toEqual({ account: { username: "alice", role: "owner" } });

    const publish = await worker.fetch(
      post(
        "/api/backend/tools",
        {
          publishedTools: {
            name: "lint",
            description: "Lint one file.",
            permissions: ["none"],
          },
        },
        cookie,
      ),
      env,
    );
    expect(publish.status).toBe(201);

    const tools = await worker.fetch(get("/api/backend/tools"), env);
    const body = await tools.json();
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("lint");
    expect(body.tools[0].publisher).toBe("alice");
  });

  it("keeps the SPA fallback and the asset 404", async () => {
    const response = await worker.fetch(get("/providers"), { ASSETS: assets() });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("keyrig");

    const asset = await worker.fetch(get("/missing.js"), { ASSETS: assets() });
    expect(asset.status).toBe(404);
  });

  it("returns 404 for an unknown backend route", async () => {
    const database = createSqliteD1();
    databases.push(database);

    const response = await worker.fetch(get("/api/backend/unknown"), {
      DB: database,
      ASSETS: assets(),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("no_route");
  });
});
