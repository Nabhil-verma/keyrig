import { describe, expect, it } from "vitest";
import { BUILTIN_MANIFESTS } from "../builtins";
import { checkBaseUrl, envVarFor, joinUrl } from "../manifest";

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

  it("has the three day-one providers and the local types", () => {
    const ids = BUILTIN_MANIFESTS.map((manifest) => manifest.id);
    expect(ids).toEqual(expect.arrayContaining(["openai", "anthropic", "ollama", "lmstudio", "openai-compatible"]));
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
});
