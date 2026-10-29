import { describe, expect, it, vi } from "vitest";
import { callMcpTool, listMcpTools } from "./mcp";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sse(body: unknown): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const endpoint = { url: "http://127.0.0.1:7000", transport: "http" as const };

describe("the MCP client", () => {
  it("reads a tool list from a JSON reply", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            { name: "search", description: "Search the notes." },
            { name: "read", description: "Read one note." },
          ],
        },
      }),
    );
    const tools = await listMcpTools(endpoint, fetchImpl as unknown as typeof fetch);
    expect(tools).toEqual([
      { name: "search", description: "Search the notes." },
      { name: "read", description: "Read one note." },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:7000");
    expect(String(init.body)).toContain("\"tools/list\"");
    expect(init.headers).toMatchObject({ accept: "application/json, text/event-stream" });
  });

  it("reads a tool list from an SSE reply", async () => {
    const fetchImpl = vi.fn(async () =>
      sse({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "ping", description: "" }] } }),
    );
    await expect(listMcpTools(endpoint, fetchImpl as unknown as typeof fetch)).resolves.toEqual([
      { name: "ping", description: "" },
    ]);
  });

  it("follows a cursor until the list ends", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ result: { tools: [{ name: "one" }], nextCursor: "next" } }))
      .mockResolvedValueOnce(json({ result: { tools: [{ name: "two" }] } }));
    const tools = await listMcpTools(endpoint, fetchImpl as unknown as typeof fetch);
    expect(tools.map((tool) => tool.name)).toEqual(["one", "two"]);
    expect(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body)).toContain("\"cursor\"");
  });

  it("refuses a blocked endpoint before it calls fetch", async () => {
    const fetchImpl = vi.fn();
    await expect(
      listMcpTools({ url: "http://169.254.169.254", transport: "http" }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports the message from a JSON-RPC error", async () => {
    const fetchImpl = vi.fn(async () => json({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "No such method." } }));
    await expect(listMcpTools(endpoint, fetchImpl as unknown as typeof fetch)).rejects.toThrow("No such method.");
  });

  it("reports a bad HTTP status", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(listMcpTools(endpoint, fetchImpl as unknown as typeof fetch)).rejects.toThrow("HTTP 503");
  });

  it("calls an allowed tool and joins its text", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        result: {
          content: [
            { type: "text", text: "First line." },
            { type: "image", data: "..." },
            { type: "text", text: "Second line." },
          ],
        },
      }),
    );
    const outcome = await callMcpTool(
      { ...endpoint, allowedTools: ["search"] },
      "search",
      { query: "note" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(outcome).toEqual({ text: "First line.\nSecond line.", isError: false });
    expect(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("\"tools/call\"");
  });

  it("refuses a tool that is not on the allowlist", async () => {
    const fetchImpl = vi.fn();
    await expect(
      callMcpTool(
        { ...endpoint, allowedTools: ["read"] },
        "write",
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow("Allow write first.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks a tool error", async () => {
    const fetchImpl = vi.fn(async () => json({ result: { content: [{ type: "text", text: "No note." }], isError: true } }));
    await expect(
      callMcpTool(
        { ...endpoint, allowedTools: ["read"] },
        "read",
        {},
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toEqual({ text: "No note.", isError: true });
  });
});
