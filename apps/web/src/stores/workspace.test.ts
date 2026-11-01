import { createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { MAX_FILE_CHARS } from "@keyrig/core";
import { Workspace } from "./workspace";

function workspace(): Workspace {
  return new Workspace({
    storage: createMemoryStorage(),
    now: () => Date.parse("2026-11-01T00:00:00.000Z"),
  });
}

describe("the agent workspace", () => {
  it("writes and reads a file", () => {
    const store = workspace();
    const file = store.write("notes/plan.md", "# Plan");
    expect(file.path).toBe("notes/plan.md");
    expect(store.read("notes/plan.md")?.content).toBe("# Plan");
  });

  it("lists the files in path order", () => {
    const store = workspace();
    store.write("b.md", "2");
    store.write("a.md", "1");
    expect(store.files().map((file) => file.path)).toEqual(["a.md", "b.md"]);
    expect(store.totals()).toEqual({ files: 2, chars: 2 });
  });

  it("replaces the text of an existing file", () => {
    const store = workspace();
    store.write("a.md", "one");
    store.write("a.md", "two");
    expect(store.files()).toHaveLength(1);
    expect(store.read("a.md")?.content).toBe("two");
  });

  it("removes a file and reports a missing one", () => {
    const store = workspace();
    store.write("a.md", "one");
    expect(store.remove("a.md")).toBe(true);
    expect(store.remove("a.md")).toBe(false);
    expect(store.files()).toEqual([]);
  });

  it("refuses a protected path (AS-02)", () => {
    expect(() => workspace().write(".env", "KEY=1")).toThrow(/protects/);
    expect(() => workspace().read("certs/server.pem")).toThrow(/protects/);
  });

  it("refuses a path that climbs out of the workspace", () => {
    expect(() => workspace().write("../a.md", "x")).toThrow();
  });

  it("searches the text of a folder", () => {
    const store = workspace();
    store.write("src/a.ts", "const key = 1;");
    store.write("docs/a.md", "the key is here");
    expect(store.search("KEY").map((match) => match.path)).toEqual(["docs/a.md", "src/a.ts"]);
    expect(store.search("key", "src").map((match) => match.path)).toEqual(["src/a.ts"]);
  });

  it("refuses a file that is too large", () => {
    expect(() => workspace().write("big.txt", "x".repeat(MAX_FILE_CHARS + 1))).toThrow(/characters/);
  });
});
