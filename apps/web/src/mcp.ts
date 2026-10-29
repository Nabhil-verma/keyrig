import { checkConnectorUrl } from "./connectors";
import { normalizeTools, type Connector, type ConnectorTool } from "./connectors";

/**
 * A small MCP client over the Streamable HTTP transport: one JSON-RPC POST per
 * call, and either a JSON reply or a short SSE stream. keyrig never opens a
 * long-lived socket and never sends a key with a tool call.
 *
 * Consent lives in the connector store. This module also enforces it, so a
 * tool that is not on the allowlist cannot run through any caller.
 */
const TIMEOUT_MS = 12_000;
const MAX_PAGES = 5;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ARGUMENT_BYTES = 32 * 1024;
const MAX_RESULT_CHARS = 8_000;

let nextRequestId = 1;

interface RpcError {
  code?: unknown;
  message?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorText(error: unknown): string {
  const record = asRecord(error);
  if (!record) {
    return "The server reported an error.";
  }
  const message = typeof record.message === "string" ? record.message.trim() : "";
  return message.length > 0 ? message : "The server reported an error.";
}

/** Read the first JSON-RPC envelope out of an SSE body. */
function envelopeFromStream(body: string): unknown {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line.length > 0)
      .join("\n");
    if (data.length === 0) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(data);
      const record = asRecord(parsed);
      if (record && (record.result !== undefined || record.error !== undefined)) {
        return parsed;
      }
    } catch {
      // A keep-alive or a comment is not an envelope. Read the next block.
    }
  }
  throw new Error("The server sent no MCP reply.");
}

async function post(
  connector: Pick<Connector, "url">,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(connector.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw new Error("The server did not answer in time.");
    }
    throw new Error("keyrig cannot reach the server. Check the URL and the CORS policy.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`The server returned HTTP ${response.status}.`);
  }
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("The server sent more data than keyrig reads.");
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("The server sent an empty reply.");
  }
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      throw new Error("The server sent JSON that keyrig cannot read.");
    }
  }
  return envelopeFromStream(trimmed);
}

async function request(
  connector: Pick<Connector, "url">,
  method: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const check = checkConnectorUrl(connector.url);
  if (!check.allowed) {
    throw new Error(check.message ?? "The endpoint is not allowed.");
  }
  const id = nextRequestId;
  nextRequestId += 1;
  const envelope = asRecord(await post(connector, { jsonrpc: "2.0", id, method, params }, fetchImpl));
  if (!envelope) {
    throw new Error("The server sent an unexpected reply.");
  }
  if (envelope.error !== undefined && envelope.error !== null) {
    throw new Error(errorText(envelope.error));
  }
  if (envelope.result === undefined) {
    throw new Error("The server sent no result.");
  }
  return envelope.result;
}

function readTools(result: unknown): { tools: ConnectorTool[]; cursor: string | null } {
  const record = asRecord(result);
  const list = record && Array.isArray(record.tools) ? record.tools : [];
  const tools: ConnectorTool[] = [];
  for (const entry of list) {
    const item = asRecord(entry);
    if (!item || typeof item.name !== "string") {
      continue;
    }
    tools.push({
      name: item.name,
      description: typeof item.description === "string" ? item.description : "",
    });
  }
  const cursor = record && typeof record.nextCursor === "string" ? record.nextCursor : null;
  return { tools, cursor };
}

/** Read the tool list. This calls nothing on the server. */
export async function listMcpTools(
  connector: Pick<Connector, "url" | "transport">,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectorTool[]> {
  const tools: ConnectorTool[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await request(connector, "tools/list", cursor ? { cursor } : {}, fetchImpl);
    const batch = readTools(result);
    tools.push(...batch.tools);
    if (!batch.cursor || tools.length >= MAX_PAGES * 100) {
      break;
    }
    cursor = batch.cursor;
  }
  const clean = normalizeTools(tools);
  if (clean.length === 0) {
    throw new Error("The server listed no tools.");
  }
  return clean;
}

/** Run one tool. The tool must be on the stored allowlist. */
export async function callMcpTool(
  connector: Pick<Connector, "url" | "transport" | "allowedTools">,
  toolName: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string; isError: boolean }> {
  if (!connector.allowedTools?.includes(toolName)) {
    throw new Error(`Allow ${toolName} first.`);
  }
  const serialized = JSON.stringify(args);
  if (serialized.length > MAX_ARGUMENT_BYTES) {
    throw new Error("The arguments are too large.");
  }
  const result = await request(connector, "tools/call", { name: toolName, arguments: args }, fetchImpl);
  const record = asRecord(result);
  const content = record && Array.isArray(record.content) ? record.content : [];
  const parts: string[] = [];
  for (const entry of content) {
    const item = asRecord(entry);
    if (item && item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  const text = parts.join("\n").trim();
  return {
    text: text.length > 0 ? text.slice(0, MAX_RESULT_CHARS) : "(The tool returned no text.)",
    isError: record?.isError === true,
  };
}
