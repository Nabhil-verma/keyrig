import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import { checkBaseUrl } from "@keyrig/providers";
import { browserStorage } from "./storage";

/**
 * A connector is an external MCP tool server. keyrig stores the endpoint, the
 * tool list that the server reported, and the tools that you allowed.
 */
export type ConnectorTransport = "http" | "sse";

export interface ConnectorTool {
  name: string;
  description: string;
}

export interface Connector {
  id: string;
  name: string;
  url: string;
  transport: ConnectorTransport;
  addedAt: string;
  /** Present after a scan. Absent means the server was never reached. */
  tools?: ConnectorTool[];
  /** Present after you allow tools. Absent means no consent yet. */
  allowedTools?: string[];
  consentAt?: string;
}

export const CONNECTORS_STORAGE_KEY = "keyrig.connectors.v1";
export const CONNECTORS_SCHEMA_VERSION = 1;
export const MAX_CONNECTORS = 25;
export const MAX_CONNECTOR_TOOLS = 100;
export const MAX_ALLOWED_TOOLS = 50;
export const CONNECTOR_NAME_LIMIT = 60;
export const CONNECTOR_URL_LIMIT = 500;
const TOOL_NAME_LIMIT = 120;
const TOOL_DESCRIPTION_LIMIT = 400;

function isTool(value: unknown): value is ConnectorTool {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && typeof record.description === "string";
}

function isConnector(value: unknown): value is Connector {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.url === "string" &&
    (record.transport === "http" || record.transport === "sse") &&
    typeof record.addedAt === "string" &&
    (record.tools === undefined || (Array.isArray(record.tools) && record.tools.every(isTool))) &&
    (record.allowedTools === undefined ||
      (Array.isArray(record.allowedTools) && record.allowedTools.every((item) => typeof item === "string"))) &&
    (record.consentAt === undefined || typeof record.consentAt === "string")
  );
}

function readAll(storage: StorageLike): Connector[] {
  let raw: string | null;
  try {
    raw = storage.getItem(CONNECTORS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isVersionedDocument(parsed) ||
      parsed.schemaVersion !== CONNECTORS_SCHEMA_VERSION ||
      !Array.isArray(parsed.data)
    ) {
      return [];
    }
    return parsed.data.filter(isConnector);
  } catch {
    return [];
  }
}

function writeAll(storage: StorageLike, connectors: Connector[]): void {
  storage.setItem(CONNECTORS_STORAGE_KEY, JSON.stringify(createDocument(CONNECTORS_SCHEMA_VERSION, connectors)));
}

function update(id: string, change: (connector: Connector) => Connector, storage: StorageLike): Connector {
  const connectors = readAll(storage);
  const index = connectors.findIndex((connector) => connector.id === id);
  if (index === -1) {
    throw new Error("That connector is not in the list.");
  }
  const next = change(connectors[index] as Connector);
  const updated = connectors.map((connector, at) => (at === index ? next : connector));
  writeAll(storage, updated);
  return next;
}

/** Check the endpoint with the same rule as a provider base URL. */
export function checkConnectorUrl(raw: string): { allowed: boolean; message: string | null } {
  const url = raw.trim();
  if (url.length === 0) {
    return { allowed: false, message: "Write the endpoint URL." };
  }
  if (url.length > CONNECTOR_URL_LIMIT) {
    return { allowed: false, message: `Keep the URL under ${CONNECTOR_URL_LIMIT} characters.` };
  }
  const check = checkBaseUrl(url);
  return { allowed: check.allowed, message: check.warning };
}

/** Trim and bound a tool list from a server before it is stored or shown. */
export function normalizeTools(tools: readonly ConnectorTool[]): ConnectorTool[] {
  const seen = new Set<string>();
  const next: ConnectorTool[] = [];
  for (const tool of tools) {
    const name = tool.name.trim();
    if (name.length === 0 || name.length > TOOL_NAME_LIMIT || seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push({
      name,
      description: tool.description.trim().slice(0, TOOL_DESCRIPTION_LIMIT),
    });
    if (next.length >= MAX_CONNECTOR_TOOLS) {
      break;
    }
  }
  return next;
}

export function listConnectors(storage: StorageLike = browserStorage()): Connector[] {
  return readAll(storage);
}

export function addConnector(
  input: { name: string; url: string; transport: ConnectorTransport },
  storage: StorageLike = browserStorage(),
): Connector {
  const name = input.name.trim();
  const url = input.url.trim();
  if (name.length === 0) {
    throw new Error("Give the connector a name.");
  }
  if (name.length > CONNECTOR_NAME_LIMIT) {
    throw new Error(`Keep the name under ${CONNECTOR_NAME_LIMIT} characters.`);
  }
  const check = checkConnectorUrl(url);
  if (!check.allowed) {
    throw new Error(check.message ?? "The endpoint is not allowed.");
  }
  const connectors = readAll(storage);
  if (connectors.length >= MAX_CONNECTORS) {
    throw new Error(`keyrig holds ${MAX_CONNECTORS} connectors. Delete one first.`);
  }
  if (connectors.some((item) => item.url === url)) {
    throw new Error("That endpoint is already in the list.");
  }
  if (input.transport !== "http" && input.transport !== "sse") {
    throw new Error("Choose a transport.");
  }
  const connector: Connector = {
    id: crypto.randomUUID(),
    name,
    url,
    transport: input.transport,
    addedAt: new Date().toISOString(),
  };
  writeAll(storage, [connector, ...connectors]);
  return connector;
}

export function removeConnector(id: string, storage: StorageLike = browserStorage()): Connector[] {
  const next = readAll(storage).filter((connector) => connector.id !== id);
  writeAll(storage, next);
  return next;
}

/** Store the tools that a scan returned. This clears any earlier consent. */
export function setConnectorTools(
  id: string,
  tools: readonly ConnectorTool[],
  storage: StorageLike = browserStorage(),
): Connector {
  const clean = normalizeTools(tools);
  return update(
    id,
    (connector) => {
      const { allowedTools: _allowed, consentAt: _consent, ...rest } = connector;
      return { ...rest, tools: clean };
    },
    storage,
  );
}

/**
 * Record the allowlist. Consent needs a scan first, and an allowed name must
 * be a tool that the server listed.
 */
export function setConnectorConsent(
  id: string,
  names: readonly string[],
  storage: StorageLike = browserStorage(),
): Connector {
  const connector = readAll(storage).find((item) => item.id === id);
  if (!connector) {
    throw new Error("That connector is not in the list.");
  }
  if (connector.tools === undefined) {
    throw new Error("Scan the server before you allow a tool.");
  }
  const listed = new Set(connector.tools.map((tool) => tool.name));
  const allowed = [...new Set(names)].filter((name) => listed.has(name));
  if (allowed.length === 0) {
    throw new Error("Allow at least one tool from the scan.");
  }
  if (allowed.length > MAX_ALLOWED_TOOLS) {
    throw new Error(`Allow at most ${MAX_ALLOWED_TOOLS} tools.`);
  }
  return update(id, (item) => ({ ...item, allowedTools: allowed, consentAt: new Date().toISOString() }), storage);
}

export function revokeConnectorConsent(id: string, storage: StorageLike = browserStorage()): Connector {
  return update(
    id,
    (connector) => {
      const { allowedTools: _allowed, consentAt: _consent, ...rest } = connector;
      return rest;
    },
    storage,
  );
}
