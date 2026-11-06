import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const sources = [
  ["development meta", read("../../index.html")],
  ["Netlify headers", read("../../public/_headers")],
  ["Vercel headers", read("../../vercel.json")],
] as const;

describe("B3 the Content-Security-Policy keeps the known hosts", () => {
  it.each(sources)("allows the catalog host in the %s", (_name, text) => {
    expect(text).toContain("connect-src");
    expect(text).toContain("https://models.dev");
  });

  it("uses no unsafe script source in production", () => {
    const headers = read("../../public/_headers");
    const vercel = read("../../vercel.json");
    for (const text of [headers, vercel]) {
      expect(text).not.toContain("script-src 'self' 'unsafe-inline'");
      expect(text).not.toContain("unsafe-eval");
    }
  });
});
