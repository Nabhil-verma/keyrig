import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

describe("PV-01 the offline shell caches only the shell", () => {
  it("never caches an API response", () => {
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    // The API guard returns before any cache read or write.
    const guard = sw.indexOf('url.pathname.startsWith("/api/")');
    const put = sw.indexOf("cache.put");
    expect(guard).toBeGreaterThan(-1);
    expect(put).toBeGreaterThan(guard);
  });

  it("caches only a GET from the same origin", () => {
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
  });

  it("drops an old shell when a new version deploys", () => {
    expect(sw).toContain("keyrig-shell-");
    expect(sw).toContain("names.filter((name) => name !== CACHE)");
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).toContain("self.clients.claim()");
  });

  it("serves the shell when a navigation request is offline", () => {
    expect(sw).toContain('caches.match("/index.html")');
  });
});
