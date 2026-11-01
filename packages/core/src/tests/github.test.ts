import { describe, expect, it } from "vitest";
import { commitFiles, parseBranch, parseRepo } from "../agent/github";

interface Call {
  url: string;
  method: string;
  body: string;
}

function fakeFetch(bodies: unknown[], status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    const body = bodies[index] ?? {};
    index += 1;
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const TOKEN = "ghp_abcdefghijklmnop";

describe("the GitHub input", () => {
  it("reads owner/repo", () => {
    expect(parseRepo("alice/site")).toEqual({ owner: "alice", repo: "site" });
    expect(() => parseRepo("site")).toThrow();
    expect(() => parseRepo("a/b/c")).toThrow();
  });

  it("refuses a branch that escapes the refs folder", () => {
    expect(parseBranch("main")).toBe("main");
    expect(parseBranch("feature/plan")).toBe("feature/plan");
    expect(() => parseBranch("../main")).toThrow();
    expect(() => parseBranch("a..b")).toThrow();
    expect(() => parseBranch("bad~name")).toThrow();
  });
});

describe("the commit path", () => {
  it("writes one blob, one tree and one commit, then moves the branch", async () => {
    const { fetchImpl, calls } = fakeFetch([
      { object: { sha: "parent1" } },
      { tree: { sha: "tree0" } },
      { sha: "blob1" },
      { sha: "tree1" },
      { sha: "commit1" },
      {},
    ]);

    const outcome = await commitFiles({
      token: TOKEN,
      owner: "alice",
      repo: "site",
      branch: "main",
      message: "Add the plan",
      files: [{ path: "docs/plan.md", content: "# Plan" }],
      fetchImpl,
    });

    expect(outcome.commitSha).toBe("commit1");
    expect(outcome.url).toBe("https://github.com/alice/site/commit/commit1");
    expect(outcome.files).toEqual(["docs/plan.md"]);
    expect(calls).toHaveLength(6);
    expect(calls[0]?.url).toBe("https://api.github.com/repos/alice/site/git/ref/heads/main");
    expect(JSON.parse(calls[3]?.body ?? "{}")).toMatchObject({ base_tree: "tree0" });
    expect(JSON.parse(calls[4]?.body ?? "{}")).toMatchObject({ message: "Add the plan", parents: ["parent1"] });
    expect(calls[5]?.method).toBe("PATCH");
    expect(JSON.parse(calls[5]?.body ?? "{}")).toMatchObject({ sha: "commit1", force: false });
  });

  it("refuses a protected file before it calls GitHub", async () => {
    const { fetchImpl, calls } = fakeFetch([{ object: { sha: "parent1" } }]);
    await expect(
      commitFiles({
        token: TOKEN,
        owner: "alice",
        repo: "site",
        branch: "main",
        message: "Add the key",
        files: [{ path: ".env", content: "SECRET=1" }],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "github_input_invalid" });
    expect(calls).toHaveLength(0);
  });

  it("refuses the same path twice", async () => {
    const { fetchImpl } = fakeFetch([{ object: { sha: "parent1" } }]);
    await expect(
      commitFiles({
        token: TOKEN,
        owner: "alice",
        repo: "site",
        branch: "main",
        message: "Add one file",
        files: [
          { path: "a.md", content: "1" },
          { path: "a.md", content: "2" },
        ],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "github_input_invalid" });
  });

  it("refuses an empty commit", async () => {
    const { fetchImpl } = fakeFetch([{}]);
    await expect(
      commitFiles({ token: TOKEN, owner: "alice", repo: "site", branch: "main", message: "Empty", files: [], fetchImpl }),
    ).rejects.toMatchObject({ code: "github_input_invalid" });
  });

  it("refuses a request with no token", async () => {
    const { fetchImpl } = fakeFetch([{}]);
    await expect(
      commitFiles({
        token: "",
        owner: "alice",
        repo: "site",
        branch: "main",
        message: "Add the plan",
        files: [{ path: "a.md", content: "1" }],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "github_not_connected" });
  });

  it("reports a rejected token without the token in the message", async () => {
    const { fetchImpl } = fakeFetch([{}], 401);
    const error = (await commitFiles({
      token: TOKEN,
      owner: "alice",
      repo: "site",
      branch: "main",
      message: "Add the plan",
      files: [{ path: "a.md", content: "1" }],
      fetchImpl,
    }).catch((caught: unknown) => caught)) as { code: string; message: string };

    expect(error.code).toBe("github_token_invalid");
    expect(error.message).not.toContain(TOKEN);
  });
});
