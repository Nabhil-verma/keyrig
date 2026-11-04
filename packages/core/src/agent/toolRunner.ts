import { KeyrigError } from "@keyrig/shared";
import { createToolSandbox } from "./sandbox";
import type { Tool } from "./toolDefinition";

/**
 * Phase 2, item 1: the sandbox runner.
 *
 * A tool runs in a Web Worker. The worker has its own global scope, so it
 * cannot reach the key vault: the vault is an object in the app thread. The
 * message holds the script, the input and the permissions. It holds no key
 * (PR-01).
 *
 * The runner adds a timeout and an output limit. A tool that runs too long or
 * returns too much stops with a clear message (PR-04).
 *
 * The worker source is a string, so this module has no UI code and the tests
 * can use a fake worker.
 */

export const TOOL_TIMEOUT_MS = 4_000;
export const TOOL_OUTPUT_CHARS = 20_000;

export interface ToolWorker {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void;
}

export type ToolWorkerFactory = (source: string) => ToolWorker;

/**
 * The worker body. It runs the tool script as one function. A permission that
 * the tool did not declare becomes a function that stops the call. The global
 * storage objects are stopped in the same way.
 */
export const TOOL_SANDBOX_SOURCE = `
const stop = () => { throw new Error("This tool has no permission for that action."); };
self.onmessage = async (event) => {
  const data = event.data || {};
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  const allow = (name) => permissions.includes(name);
  const api = Object.freeze({
    files: allow("files") ? Object.freeze({ ...(data.files || {}) }) : null,
    now: () => Date.now()
  });
  try {
    const fn = new Function(
      "input", "api", "fetch", "localStorage", "sessionStorage", "indexedDB", "WebSocket", "importScripts", "Worker",
      data.script
    );
    const output = await fn(
      data.input,
      api,
      allow("network") ? self.fetch : stop,
      stop, stop, stop, stop, stop, stop
    );
    const text = JSON.stringify(output);
    if (text === undefined) {
      throw new Error("The tool returned no data.");
    }
    self.postMessage({ ok: true, output: text });
  } catch (error) {
    self.postMessage({ ok: false, message: String(error && error.message ? error.message : error) });
  }
};
`;

export interface ToolRunOptions {
  tool: Tool;
  input: Record<string, unknown>;
  /** AS-01: the person approved this tool code. There is no default. */
  approved: boolean;
  factory: ToolWorkerFactory | null;
  /** A workspace snapshot. It reaches the tool only with the files permission. */
  files?: Record<string, string>;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface ToolRunResult {
  output: unknown;
  durationMs: number;
}

function toolError(
  category: "invalid_request" | "timeout" | "server",
  code: string,
  message: string,
  retryable: boolean,
): KeyrigError {
  return KeyrigError.fromCategory(category, {
    code,
    message,
    retryable,
    action: category === "timeout" ? "retry" : "none",
  });
}

function approvalError(): KeyrigError {
  return toolError(
    "invalid_request",
    "tool_approval_required",
    "Read the tool warning and approve this tool before it runs.",
    false,
  );
}

interface WorkerReply {
  ok: boolean;
  output?: unknown;
  message?: unknown;
}

/** Run one tool call in a fresh worker. The worker always stops after the call. */
export async function runToolInSandbox(options: ToolRunOptions): Promise<ToolRunResult> {
  if (options.approved !== true) {
    throw approvalError();
  }
  if (options.factory === null) {
    throw toolError(
      "invalid_request",
      "tool_sandbox_unavailable",
      "keyrig cannot start the tool sandbox in this browser.",
      false,
    );
  }

  const permissions = options.tool.permissions;
  // PR-01: the context builder refuses a vault, a key or a passphrase member.
  const context = createToolSandbox({
    tool: options.tool.name,
    input: options.input,
    permissions,
  });
  const files = permissions.includes("files") && options.files !== undefined ? { ...options.files } : {};

  const worker = options.factory(TOOL_SANDBOX_SOURCE);
  const timeoutMs = options.timeoutMs ?? TOOL_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? TOOL_OUTPUT_CHARS;
  const startedAt = Date.now();

  return await new Promise<ToolRunResult>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      action();
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          toolError(
            "timeout",
            "tool_timeout",
            `The tool did not finish in ${Math.round(timeoutMs / 1000)} seconds. keyrig stopped it.`,
            true,
          ),
        ),
      );
    }, timeoutMs);

    worker.addEventListener("message", (event) => {
      const data = (event as MessageEvent).data as WorkerReply | undefined;
      if (data === undefined || typeof data !== "object") {
        finish(() => reject(toolError("server", "tool_failed", "The tool sent no result.", false)));
        return;
      }
      if (data.ok && typeof data.output === "string") {
        if (data.output.length > maxOutputChars) {
          finish(() =>
            reject(
              toolError(
                "invalid_request",
                "tool_output_too_large",
                `The tool returned more than ${maxOutputChars} characters. keyrig stopped it.`,
                false,
              ),
            ),
          );
          return;
        }
        let output: unknown;
        try {
          output = JSON.parse(data.output);
        } catch {
          finish(() => reject(toolError("server", "tool_failed", "The tool returned broken data.", false)));
          return;
        }
        finish(() => resolve({ output, durationMs: Date.now() - startedAt }));
        return;
      }
      const message =
        typeof data.message === "string" && data.message.length > 0
          ? data.message.slice(0, 300)
          : "The tool stopped before it returned a result.";
      finish(() => reject(toolError("server", "tool_failed", message, true)));
    });

    worker.addEventListener("error", () => {
      finish(() => reject(toolError("server", "tool_failed", "The tool sandbox stopped with an error.", true)));
    });

    worker.postMessage({
      kind: "keyrig.tool.run",
      script: options.tool.script,
      input: context.input,
      permissions,
      files,
    });
  });
}
