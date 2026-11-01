import { describe, expect, it } from "vitest";
import { applyToken, expandContext, findToken } from "./composerTokens";

describe("the composer shortcuts (CX-04)", () => {
  it("finds a file token at the cursor", () => {
    expect(findToken("read @pl", 8)).toEqual({ kind: "file", query: "pl", start: 5, end: 8 });
  });

  it("finds a skill token at the cursor", () => {
    expect(findToken("run /review", 11)).toEqual({ kind: "skill", query: "review", start: 4, end: 11 });
  });

  it("finds an empty token", () => {
    expect(findToken("@", 1)).toEqual({ kind: "file", query: "", start: 0, end: 1 });
  });

  it("finds no token in a plain sentence", () => {
    expect(findToken("hello there", 11)).toBeNull();
    expect(findToken("a/b", 3)).toBeNull();
  });

  it("replaces the token and keeps the rest of the text", () => {
    const token = findToken("write @pl now", 9);
    expect(token).not.toBeNull();
    expect(applyToken("write @pl now", token!, "@docs/plan.md")).toBe("write @docs/plan.md now");
  });
});

describe("the file context", () => {
  const files = [{ path: "docs/a.md", content: "x".repeat(30) }];

  it("adds the text of a real file", () => {
    const text = expandContext("read @docs/a.md", files);
    expect(text).toContain('<file path="docs/a.md">');
    expect(text).toContain("x".repeat(30));
  });

  it("keeps a path that the workspace does not have", () => {
    expect(expandContext("read @docs/missing.md", files)).toBe("read @docs/missing.md");
  });

  it("adds one block for one file", () => {
    const text = expandContext("@docs/a.md and again @docs/a.md", files);
    expect(text.match(/<file /g)).toHaveLength(1);
  });

  it("stops at the limit", () => {
    const text = expandContext("read @docs/a.md", files, 10);
    expect(text).toContain('<file path="docs/a.md">');
    expect(text).toContain("x".repeat(10));
    expect(text).not.toContain("x".repeat(11));
  });
});
