import { formatUsd } from "@keyrig/providers";
import type { StoredThread } from "../stores/threads";
import type { UIMessage } from "./types";

/**
 * One saved chat as Markdown. The export holds what the user saw: the prompt,
 * the answer, the model, the key label and the cost. It holds no key secret.
 */
export function threadToMarkdown(thread: StoredThread): string {
  const lines: string[] = [
    `# ${thread.title}`,
    "",
    `Exported ${new Date().toISOString()} from keyrig.`,
    "",
  ];

  for (const message of thread.messages) {
    if (message.role === "user") {
      lines.push("## You", "", message.display ?? message.content, "");
      continue;
    }

    const meta = messageMeta(message);
    lines.push(`## ${message.model ?? "Model"}`, "");
    if (meta.length > 0) {
      lines.push(`_${meta.join(" · ")}_`, "");
    }
    if (message.content.length > 0) {
      lines.push(message.content, "");
    }
    if (message.error !== undefined) {
      lines.push(`> **${message.error.category}** — ${message.error.message}`, "");
    }
    if (message.scene !== undefined) {
      lines.push(`_3D scene: ${message.scene.title} (${message.scene.nodes.length} nodes)_`, "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function messageMeta(message: UIMessage): string[] {
  const meta: string[] = [];
  if (message.providerId !== undefined) {
    meta.push(message.providerId);
  }
  if (message.keyLabel !== undefined) {
    meta.push(`key ${message.keyLabel}`);
  }
  if (message.inputTokens !== undefined) {
    meta.push(`${message.inputTokens.toLocaleString()} in / ${(message.outputTokens ?? 0).toLocaleString()} out`);
  }
  if (message.costUsd !== undefined) {
    meta.push(message.pricingKnown === false ? "cost unknown" : `${formatUsd(message.costUsd, true)} estimated`);
  }
  if (message.stopReason !== undefined && message.stopReason !== "complete") {
    meta.push(message.stopReason);
  }
  return meta;
}

/** A file name that works on every system. */
export function fileSafeName(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "keyrig-thread";
}

/** Save text as a file in this browser. Nothing leaves the device. */
export function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
