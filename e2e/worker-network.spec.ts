import { expect, test, type Page } from "@playwright/test";
import { buildToolSandboxSource } from "../packages/core/src/agent/toolRunner";

interface WorkerReply {
  ok: boolean;
  output?: string;
  message?: string;
}

/**
 * B2: run the generated worker in a real Chromium Worker, not a Node shim.
 * The source comes from the same function that the app uses. A blob URL is
 * same-origin and the dev CSP allows it with worker-src.
 */
async function probe(page: Page, script: string, permissions: string[]): Promise<WorkerReply> {
  const source = buildToolSandboxSource(script);
  return await page.evaluate(
    ({ source, permissions }) =>
      new Promise<WorkerReply>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const worker = new Worker(url);
        const done = (action: () => void): void => {
          window.clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          action();
        };
        const timer = window.setTimeout(() => {
          done(() => reject(new Error("The worker did not answer.")));
        }, 5_000);
        worker.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
          done(() => resolve(event.data));
        });
        worker.addEventListener("error", (event) => {
          done(() => reject(new Error(event.message)));
        });
        worker.postMessage({ input: {}, permissions, files: {} });
      }),
    { source, permissions },
  );
}

test("B2 the real browser worker has no network path and keeps the permitted one", async ({ page }) => {
  await page.goto("/app");

  const blocked = [
    ["global fetch", 'return await fetch("http://127.0.0.1:8788/__keyrig_leak")'],
    ["self.fetch", 'return await self.fetch("http://127.0.0.1:8788/__keyrig_leak")'],
    ["globalThis.fetch", 'return await globalThis.fetch("http://127.0.0.1:8788/__keyrig_leak")'],
    ["XMLHttpRequest", "return new XMLHttpRequest()"],
    ["WebSocket", 'return new WebSocket("ws://127.0.0.1:8788/__keyrig_leak")'],
    ["importScripts", 'return importScripts("http://127.0.0.1:8788/__keyrig_leak")'],
    ["Worker", 'return new Worker("http://127.0.0.1:8788/__keyrig_leak")'],
    ["navigator.sendBeacon", 'return navigator.sendBeacon("http://127.0.0.1:8788/__keyrig_leak", "x")'],
    [
      "restore fetch",
      'self.fetch = () => { throw new Error("leak"); }; return await globalThis.fetch("x")',
    ],
  ] as const;

  for (const [name, script] of blocked) {
    const reply = await probe(page, script, ["none"]);
    expect(reply.ok, name).toBe(false);
  }

  // The removed globals stay absent after the worker starts.
  const types = await probe(
    page,
    `return {
      fetch: typeof fetch,
      selfFetch: typeof self.fetch,
      xhr: typeof XMLHttpRequest,
      socket: typeof WebSocket,
      worker: typeof Worker,
      storage: typeof localStorage,
      beacon: typeof navigator.sendBeacon
    };`,
    ["none"],
  );
  expect(types.ok).toBe(true);
  expect(JSON.parse(types.output ?? "{}")).toEqual({
    fetch: "undefined",
    selfFetch: "undefined",
    xhr: "undefined",
    socket: "undefined",
    worker: "undefined",
    storage: "undefined",
    beacon: "undefined",
  });

  // A tool with the network permission must still reach the provider. The
  // captured fetch needs its worker global as `this`.
  const sameOrigin = await probe(
    page,
    'const response = await fetch("http://127.0.0.1:5199/manifest.webmanifest"); return response.status;',
    ["network"],
  );
  expect(sameOrigin.ok, sameOrigin.message ?? "no same-origin reply").toBe(true);
  expect(JSON.parse(sameOrigin.output ?? "null")).toBe(200);

  const remote = await probe(
    page,
    'const response = await fetch("http://127.0.0.1:8788/v1/models"); return response.status;',
    ["network"],
  );
  expect(remote.ok, remote.message ?? "no remote reply").toBe(true);
  expect(JSON.parse(remote.output ?? "null")).toBe(200);

  // The same permission must not open the other network paths.
  const otherPath = await probe(page, "return new XMLHttpRequest();", ["network"]);
  expect(otherPath.ok).toBe(false);
});
