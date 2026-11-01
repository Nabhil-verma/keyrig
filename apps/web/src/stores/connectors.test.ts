import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@keyrig/shared";
import {
  addConnector,
  checkConnectorUrl,
  listConnectors,
  normalizeTools,
  removeConnector,
  revokeConnectorConsent,
  setConnectorConsent,
  setConnectorTools,
} from "./connectors";

describe("a connector is an external tool server", () => {
  it("adds a local endpoint and reads it back", () => {
    const storage = createMemoryStorage();
    const connector = addConnector(
      { name: "  Notes  ", url: "http://127.0.0.1:7000", transport: "http" },
      storage,
    );
    expect(connector.name).toBe("Notes");
    expect(listConnectors(storage)).toEqual([connector]);
  });

  it("rejects a duplicate endpoint", () => {
    const storage = createMemoryStorage();
    addConnector({ name: "One", url: "http://127.0.0.1:7000", transport: "http" }, storage);
    expect(() => addConnector({ name: "Two", url: "http://127.0.0.1:7000", transport: "sse" }, storage)).toThrow(
      "That endpoint is already in the list.",
    );
  });

  it("blocks a cloud metadata address", () => {
    expect(checkConnectorUrl("http://169.254.169.254").allowed).toBe(false);
    const storage = createMemoryStorage();
    expect(() =>
      addConnector({ name: "Metadata", url: "http://169.254.169.254", transport: "http" }, storage),
    ).toThrow();
  });

  it("requires https on a public host", () => {
    expect(checkConnectorUrl("http://example.com").allowed).toBe(false);
    expect(checkConnectorUrl("https://example.com").allowed).toBe(true);
    expect(checkConnectorUrl("http://localhost:7000").allowed).toBe(true);
  });

  it("rejects an empty name and an empty url", () => {
    const storage = createMemoryStorage();
    expect(() => addConnector({ name: " ", url: "http://127.0.0.1:7000", transport: "http" }, storage)).toThrow(
      "Give the connector a name.",
    );
    expect(() => addConnector({ name: "Name", url: " ", transport: "http" }, storage)).toThrow(
      "Write the endpoint URL.",
    );
  });

  it("removes one connector", () => {
    const storage = createMemoryStorage();
    const first = addConnector({ name: "One", url: "http://127.0.0.1:7001", transport: "http" }, storage);
    addConnector({ name: "Two", url: "http://127.0.0.1:7002", transport: "sse" }, storage);
    expect(removeConnector(first.id, storage).map((item) => item.name)).toEqual(["Two"]);
  });
});

describe("connector consent", () => {
  const tools = [
    { name: "search", description: "Search the notes." },
    { name: "read", description: "Read one note." },
  ];

  function setup() {
    const storage = createMemoryStorage();
    const connector = addConnector({ name: "Notes", url: "http://127.0.0.1:7000", transport: "http" }, storage);
    return { storage, connector };
  }

  it("needs a scan before consent", () => {
    const { storage, connector } = setup();
    expect(() => setConnectorConsent(connector.id, ["search"], storage)).toThrow("Scan the server before you allow a tool.");
  });

  it("stores the tool list and clears an older consent", () => {
    const { storage, connector } = setup();
    setConnectorTools(connector.id, tools, storage);
    setConnectorConsent(connector.id, ["search"], storage);
    const scanned = setConnectorTools(connector.id, [...tools, { name: "write", description: "" }], storage);
    expect(scanned.tools?.map((tool) => tool.name)).toEqual(["search", "read", "write"]);
    expect(scanned.allowedTools).toBeUndefined();
    expect(scanned.consentAt).toBeUndefined();
  });

  it("keeps only names that the server listed", () => {
    const { storage, connector } = setup();
    setConnectorTools(connector.id, tools, storage);
    const consented = setConnectorConsent(connector.id, ["search", "invented", "search"], storage);
    expect(consented.allowedTools).toEqual(["search"]);
    expect(typeof consented.consentAt).toBe("string");
  });

  it("refuses an allowlist with no listed tool", () => {
    const { storage, connector } = setup();
    setConnectorTools(connector.id, tools, storage);
    expect(() => setConnectorConsent(connector.id, ["invented"], storage)).toThrow("Allow at least one tool from the scan.");
  });

  it("revokes consent and keeps the scan", () => {
    const { storage, connector } = setup();
    setConnectorTools(connector.id, tools, storage);
    setConnectorConsent(connector.id, ["search"], storage);
    const revoked = revokeConnectorConsent(connector.id, storage);
    expect(revoked.allowedTools).toBeUndefined();
    expect(revoked.tools).toHaveLength(2);
    expect(listConnectors(storage)[0]?.tools).toHaveLength(2);
  });

  it("drops an empty, duplicate or long tool name", () => {
    const clean = normalizeTools([
      { name: " one ", description: "a" },
      { name: "one", description: "b" },
      { name: "   ", description: "c" },
      { name: "x".repeat(200), description: "d" },
      { name: "two", description: "" },
    ]);
    expect(clean.map((tool) => tool.name)).toEqual(["one", "two"]);
    expect(clean[0]?.description).toBe("a");
  });
});
