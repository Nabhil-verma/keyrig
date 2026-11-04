import type { ToolWorker } from "@keyrig/core";

/**
 * Phase 2: the browser worker for a tool call.
 *
 * The worker gets one script from the core runner. It has its own global
 * scope, so it cannot read the key vault in the app thread (PR-01).
 */
export function browserToolWorker(source: string): ToolWorker {
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  return {
    postMessage: (message: unknown) => worker.postMessage(message),
    terminate: () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    },
    addEventListener: (type, listener) => {
      worker.addEventListener(type, listener as EventListener);
    },
  };
}
