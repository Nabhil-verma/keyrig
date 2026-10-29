#!/usr/bin/env node
/**
 * A local MCP tool server for development tests.
 *
 * It speaks JSON-RPC over HTTP and needs no key and no network. It is not part
 * of the product.
 *   npm run fake-mcp
 * Then add the connector http://127.0.0.1:8789/mcp in Settings.
 */
import { createServer } from "node:http";

const PORT = 8789;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
};

const TOOLS = [
  {
    name: "echo",
    description: "Return the text from the arguments.",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
  },
  {
    name: "time",
    description: "Return a fixed timestamp. The test never reads a clock.",
    inputSchema: { type: "object", properties: {} },
  },
];

function reply(response, id, body) {
  response.writeHead(200, { ...CORS, "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id, ...body }));
}

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { ...CORS, "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Not found" } }));
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    let message;
    try {
      message = JSON.parse(body);
    } catch {
      response.writeHead(400, { ...CORS, "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Bad JSON" } }));
      return;
    }

    const id = message.id ?? null;
    if (message.method === "initialize") {
      reply(response, id, {
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "keyrig-fake-mcp", version: "1.0.0" },
        },
      });
      return;
    }

    if (message.method === "tools/list") {
      reply(response, id, { result: { tools: TOOLS } });
      return;
    }

    if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments ?? {};
      if (name === "echo") {
        const text = typeof args.text === "string" ? args.text : "";
        reply(response, id, { result: { content: [{ type: "text", text }] } });
        return;
      }
      if (name === "time") {
        reply(response, id, { result: { content: [{ type: "text", text: "2026-01-01T00:00:00.000Z" }] } });
        return;
      }
      reply(response, id, { error: { code: -32602, message: `Unknown tool: ${String(name)}` } });
      return;
    }

    reply(response, id, { error: { code: -32601, message: "No such method." } });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake mcp: http://127.0.0.1:${PORT}/mcp`);
});
