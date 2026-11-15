import { PROVIDER_KEY_PREFIXES } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import { BUILTIN_MANIFESTS } from "../manifests/builtins";
import { checkBaseUrl, envVarFor, joinUrl } from "../manifests/manifest";

describe("PV-02 provider manifests", () => {
  it("has every required field and a unique id", () => {
    const ids = new Set<string>();
    for (const manifest of BUILTIN_MANIFESTS) {
      expect(manifest.id.length, "id").toBeGreaterThan(0);
      expect(manifest.displayName.length, "displayName").toBeGreaterThan(0);
      expect(["api-key", "none", "api-key-optional"]).toContain(manifest.authType);
      expect(manifest.baseUrl.length, "baseUrl").toBeGreaterThan(0);
      expect(["openai-chat", "anthropic-messages", "ollama-chat"]).toContain(manifest.wireFormat);
      expect(["openai-reasoning", "anthropic-thinking", "ollama-think", "none"]).toContain(
        manifest.reasoningFormat,
      );
      expect(manifest.abilities.streaming).toBe(true);
      expect(ids.has(manifest.id)).toBe(false);
      ids.add(manifest.id);
    }
  });

  it("KS-03 gives every manifest its key prefixes, or an explicit empty list", () => {
    const known = new Set(PROVIDER_KEY_PREFIXES.map((entry) => entry.prefix));
    for (const manifest of BUILTIN_MANIFESTS) {
      expect(Array.isArray(manifest.keyPrefixes), manifest.id).toBe(true);
      for (const prefix of manifest.keyPrefixes) {
        expect(known.has(prefix), `${manifest.id} ${prefix}`).toBe(true);
      }
    }
    // The providers that issue a key must name at least one prefix.
    for (const id of ["openai", "anthropic"]) {
      const manifest = BUILTIN_MANIFESTS.find((entry) => entry.id === id);
      expect(manifest?.keyPrefixes.length, id).toBeGreaterThan(0);
    }
    // Local providers have no known prefix. The empty list is the explicit entry.
    const local = BUILTIN_MANIFESTS.find((entry) => entry.id === "ollama");
    expect(local?.keyPrefixes).toEqual([]);
  });

  it("has the three day-one providers and the local types", () => {
    const ids = BUILTIN_MANIFESTS.map((manifest) => manifest.id);
    expect(ids).toEqual(expect.arrayContaining(["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"]));
  });

  it("adds keyrig hosted as a provider that needs no key", () => {
    const hosted = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "keyrig-hosted");
    expect(hosted).toBeDefined();
    expect(hosted?.authType).toBe("none");
    expect(hosted?.baseUrl).toBe("/api/ai/v1");
    expect(hosted?.wireFormat).toBe("openai-chat");
    expect(hosted?.abilities.modelList).toBe(true);
    expect(hosted?.supportsCustomBaseUrl).toBe(false);
    expect(checkBaseUrl(hosted?.baseUrl ?? "").allowed).toBe(true);
  });

  it("adds Freebuff as an OpenAI-compatible hosted provider", () => {
    const freebuff = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "freebuff");
    expect(freebuff).toBeDefined();
    expect(freebuff?.displayName).toBe("Freebuff");
    expect(freebuff?.authType).toBe("api-key");
    expect(freebuff?.baseUrl).toBe("https://freebuff.com/api/v1/paid");
    expect(freebuff?.wireFormat).toBe("openai-chat");
    expect(freebuff && envVarFor(freebuff)).toBe("FREEBUFF_API_KEY");
    expect(freebuff?.networkHint).toMatch(/browser origin/);
  });

  it("gives the hosted providers a standard environment variable (KS-08)", () => {
    const openai = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "openai");
    const anthropic = BUILTIN_MANIFESTS.find((manifest) => manifest.id === "anthropic");
    expect(openai && envVarFor(openai)).toBe("OPENAI_API_KEY");
    expect(anthropic && envVarFor(anthropic)).toBe("ANTHROPIC_API_KEY");
  });

  it("joins a base URL and a path without a double slash", () => {
    expect(joinUrl("https://api.openai.com/v1/", "/chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});

describe("KS-07 custom base URL checks", () => {
  it("blocks a cloud metadata address", () => {
    const check = checkBaseUrl("http://169.254.169.254/latest/meta-data");
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("blocked-metadata");
  });

  it("blocks the Google metadata host and the IPv6 metadata address", () => {
    expect(checkBaseUrl("http://metadata.google.internal/").allowed).toBe(false);
    expect(checkBaseUrl("http://[fd00:ec2::254]/").allowed).toBe(false);
  });

  it("allows a local address and gives a warning", () => {
    const check = checkBaseUrl("http://127.0.0.1:11434");
    expect(check.allowed).toBe(true);
    expect(check.warning).toMatch(/private address/);
  });

  it("allows localhost for Ollama", () => {
    expect(checkBaseUrl("http://localhost:11434").allowed).toBe(true);
  });

  it("blocks insecure http on a public host", () => {
    const check = checkBaseUrl("http://example.com/v1");
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("insecure-remote");
  });

  it("blocks a URL that is not a URL", () => {
    expect(checkBaseUrl("not a url").reason).toBe("invalid-url");
  });

  it("allows a public https URL", () => {
    const check = checkBaseUrl("https://api.example.com/v1");
    expect(check.allowed).toBe(true);
    expect(check.warning).toBeNull();
  });

  it("allows a same-origin path and still blocks a protocol-relative host", () => {
    expect(checkBaseUrl("/api/ai/v1")).toMatchObject({ allowed: true, warning: null });
    expect(checkBaseUrl("//evil.example/v1").allowed).toBe(false);
  });

  it("does not treat a public host with a private prefix as private", () => {
    for (const host of ["10.evil.com", "127.evil.com", "192.168.evil.com", "172.16.evil.com"]) {
      const check = checkBaseUrl(`http://${host}/v1`);
      expect(check.allowed, host).toBe(false);
      expect(check.reason, host).toBe("insecure-remote");
    }
  });

  it("allows https on a public lookalike with no warning", () => {
    expect(checkBaseUrl("https://10.evil.com/v1")).toMatchObject({ allowed: true, warning: null });
  });

  it("warns for the private IPv4 and IPv6 ranges", () => {
    for (const url of [
      "http://10.0.0.5",
      "http://172.16.0.1",
      "http://192.168.1.1",
      "http://169.254.10.1",
      "http://[fd00::1]",
      "http://[fe80::1]",
    ]) {
      const check = checkBaseUrl(url);
      expect(check.allowed, url).toBe(true);
      expect(check.warning, url).toMatch(/private address/);
    }
  });
});
