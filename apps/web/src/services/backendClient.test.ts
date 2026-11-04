import { describe, expect, it } from "vitest";
import { BackendError, createBackendClient, isBackendOff } from "./backendClient";

interface Call {
  path: string;
  init: RequestInit | undefined;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = async (path: string, init?: RequestInit): Promise<Response> => {
    calls.push({ path, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

const KEY = "sk-ant-abcdefghijklmnopqrstuvwx";

describe("PR-01 the client sends only the allowed fields", () => {
  it("sends one account field and no key", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { account: { username: "alice", role: "owner" } });
    const client = createBackendClient(fetchImpl);

    await client.signUp("alice", "correct-horse");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/api/backend/account?mode=sign-up");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["account"]);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(calls[0]?.init?.credentials).toBe("same-origin");
  });

  it("refuses a password that looks like a provider key before the request", async () => {
    const { calls, fetchImpl } = fakeFetch(200, {});
    const client = createBackendClient(fetchImpl);

    await expect(client.signIn("alice", KEY)).rejects.toThrow(/provider key/i);
    expect(calls).toHaveLength(0);
  });

  it("publishes a tool through the publishedTools field only", async () => {
    const { calls, fetchImpl } = fakeFetch(201, { tool: { id: "t1", name: "slugify" } });
    const client = createBackendClient(fetchImpl);

    await client.publishTool({
      name: "slugify",
      description: "Turn a title into a slug.",
      permissions: ["none"],
      version: 1,
      tags: ["text"],
      definition: {
        name: "slugify",
        description: "Turn a title into a slug.",
        permissions: ["none"],
        inputSchema: { type: "object", properties: {}, required: [] },
        script: "return { slug: String(input.text ?? '') };",
      },
    });

    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["publishedTools"]);
  });
});

describe("PR-04 a failed backend call is clear", () => {
  it("keeps the status, the code and the message", async () => {
    const { fetchImpl } = fakeFetch(403, {
      error: { code: "account_refused", message: "That account name and password do not match." },
    });
    const client = createBackendClient(fetchImpl);

    const failure = await client.signIn("alice", "wrong-password").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BackendError);
    expect((failure as BackendError).status).toBe(403);
    expect((failure as BackendError).code).toBe("account_refused");
    expect((failure as BackendError).message).toContain("do not match");
  });

  it("marks a site without a database binding as off", async () => {
    const { fetchImpl } = fakeFetch(503, {
      error: { code: "no_database", message: "The keyrig backend is not set up on this site." },
    });
    const client = createBackendClient(fetchImpl);

    const failure = await client.me().catch((error: unknown) => error);
    expect(isBackendOff(failure)).toBe(true);
  });

  it("reads a page answer as the backend being off", async () => {
    // A static host with no Worker answers the page, not the API.
    const client = createBackendClient(
      async () =>
        new Response("<!doctype html><title>keyrig</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const failure = await client.listTools().catch((error: unknown) => error);
    expect(isBackendOff(failure)).toBe(true);
  });

  it("turns a network failure into a clear message", async () => {
    const client = createBackendClient(async () => {
      throw new Error("offline");
    });

    await expect(client.me()).rejects.toThrow(/cannot reach the backend/);
  });
});

describe("D-07 an owner changes a role through the account field", () => {
  it("sends the name and the role", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { account: { username: "bob", role: "member" } });
    const client = createBackendClient(fetchImpl);

    await client.setRole("bob", "member");

    const body = JSON.parse(String(calls[0]?.init?.body)) as { account: { username: string; role: string } };
    expect(body.account).toEqual({ username: "bob", role: "member" });
  });
});
