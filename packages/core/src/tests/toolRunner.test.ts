import { describe, expect, it } from "vitest";
import { TOOL_SANDBOX_SOURCE, runToolInSandbox, type ToolWorker } from "../agent/toolRunner";
import type { Tool } from "../agent/toolDefinition";

const TOOL: Tool = {
  id: "tool_test",
  name: "echo_text",
  description: "Return the text.",
  permissions: ["none"],
  source: "user",
  version: 1,
  script: "return { text: input.text };",
  updatedAt: "2026-11-04T00:00:00.000Z",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "The text." } },
    required: ["text"],
    additionalProperties: false,
  },
};

class FakeWorker implements ToolWorker {
  posted: Array<Record<string, unknown>> = [];
  terminated = false;
  private messageListener: ((event: MessageEvent | ErrorEvent) => void) | null = null;
  private errorListener: ((event: MessageEvent | ErrorEvent) => void) | null = null;
  readonly onPost: ((message: Record<string, unknown>) => void) | null;

  constructor(onPost: ((message: Record<string, unknown>) => void) | null = null) {
    this.onPost = onPost;
  }

  postMessage(message: unknown): void {
    this.posted.push(message as Record<string, unknown>);
    this.onPost?.(message as Record<string, unknown>);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === "message") {
      this.messageListener = listener;
    } else {
      this.errorListener = listener;
    }
  }

  reply(data: unknown): void {
    this.messageListener?.({ data } as MessageEvent);
  }

  fail(): void {
    this.errorListener?.({} as ErrorEvent);
  }
}

describe("PR-01 the tool sandbox holds no key", () => {
  it("sends the input, the script and the permissions only", async () => {
    const worker = new FakeWorker();
    const run = runToolInSandbox({
      tool: TOOL,
      input: { text: "hello" },
      approved: true,
      factory: () => worker,
    });
    worker.reply({ ok: true, output: JSON.stringify({ text: "hello" }) });
    await run;

    const message = JSON.stringify(worker.posted[0] ?? {});
    expect(Object.keys(worker.posted[0] ?? {}).sort()).toEqual([
      "files",
      "input",
      "kind",
      "permissions",
      "script",
    ]);
    for (const name of ["vault", "passphrase", "apiKey", "secret"]) {
      expect(message.toLowerCase()).not.toContain(name.toLowerCase());
    }
    expect(worker.terminated).toBe(true);
  });

  it("gives the worker no files without the files permission", async () => {
    const worker = new FakeWorker();
    const run = runToolInSandbox({
      tool: TOOL,
      input: { text: "hello" },
      files: { "notes.md": "private" },
      approved: true,
      factory: () => worker,
    });
    worker.reply({ ok: true, output: "{}" });
    await run;

    expect(worker.posted[0]?.files).toEqual({});
  });

  it("stops a global storage object in the worker source", () => {
    expect(TOOL_SANDBOX_SOURCE).toContain('"localStorage"');
    expect(TOOL_SANDBOX_SOURCE).toContain('"indexedDB"');
    expect(TOOL_SANDBOX_SOURCE).toContain('allow("files")');
    expect(TOOL_SANDBOX_SOURCE).toContain('allow("network")');
  });
});

describe("AS-01 a tool never runs without an approval", () => {
  it("refuses a call with approved false", async () => {
    let started = false;
    await expect(
      runToolInSandbox({
        tool: TOOL,
        input: { text: "hello" },
        approved: false,
        factory: () => {
          started = true;
          return new FakeWorker();
        },
      }),
    ).rejects.toThrow(/approve/i);
    expect(started).toBe(false);
  });
});

describe("PR-04 a failing tool stops in a clear way", () => {
  it("stops a tool that returns too much output", async () => {
    const worker = new FakeWorker();
    const run = runToolInSandbox({
      tool: TOOL,
      input: { text: "hello" },
      approved: true,
      maxOutputChars: 20,
      factory: () => worker,
    });
    worker.reply({ ok: true, output: JSON.stringify({ text: "x".repeat(60) }) });

    await expect(run).rejects.toThrow(/more than 20 characters/);
    expect(worker.terminated).toBe(true);
  });

  it("stops a tool that runs too long and ends the worker", async () => {
    const worker = new FakeWorker();
    await expect(
      runToolInSandbox({
        tool: TOOL,
        input: { text: "hello" },
        approved: true,
        timeoutMs: 10,
        factory: () => worker,
      }),
    ).rejects.toThrow(/did not finish/);
    expect(worker.terminated).toBe(true);
  });

  it("shows the message of a tool that stops with an error", async () => {
    const worker = new FakeWorker();
    const run = runToolInSandbox({
      tool: TOOL,
      input: { text: "hello" },
      approved: true,
      factory: () => worker,
    });
    worker.reply({ ok: false, message: "This tool has no permission for that action." });

    await expect(run).rejects.toThrow(/no permission/);
  });

  it("stops a worker that crashes", async () => {
    const worker = new FakeWorker();
    const run = runToolInSandbox({
      tool: TOOL,
      input: { text: "hello" },
      approved: true,
      factory: () => worker,
    });
    worker.fail();

    await expect(run).rejects.toThrow(/sandbox stopped/);
  });
});
