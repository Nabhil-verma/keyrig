import { formatUsd } from "@keyrig/providers";
import type { StoredThread } from "../stores/threads";

/** The totals that a receipt shows. They come from the answers of the thread. */
export interface ReceiptTotals {
  answers: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  pricingKnown: boolean;
  models: string[];
  keyLabels: string[];
}

export function receiptTotals(thread: StoredThread): ReceiptTotals {
  const models = new Set<string>();
  const keyLabels = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let pricingKnown = true;
  let answers = 0;

  for (const message of thread.messages) {
    if (message.role !== "assistant") {
      continue;
    }
    answers += 1;
    inputTokens += message.inputTokens ?? 0;
    outputTokens += message.outputTokens ?? 0;
    costUsd += message.costUsd ?? 0;
    if (message.pricingKnown === false) {
      pricingKnown = false;
    }
    if (message.model !== undefined) {
      models.add(message.model);
    }
    if (message.keyLabel !== undefined) {
      keyLabels.add(message.keyLabel);
    }
  }

  return {
    answers,
    inputTokens,
    outputTokens,
    costUsd,
    pricingKnown,
    models: [...models],
    keyLabels: [...keyLabels],
  };
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function list(values: string[], fallback: string): string {
  return values.length === 0 ? fallback : cut(values.join(", "), 54);
}

/**
 * PR-02 and PR-03 as one image: the model, the key label, the tokens and the
 * cost of a chat. The card holds no prompt text and no key secret.
 */
export function threadReceiptSvg(thread: StoredThread): string {
  const totals = receiptTotals(thread);
  const cost = totals.pricingKnown ? `${formatUsd(totals.costUsd, true)} estimated` : "cost unknown";
  const rows: Array<[string, string]> = [
    ["MODEL", list(totals.models, "no answer yet")],
    ["KEY LABEL", list(totals.keyLabels, "no key")],
    ["TOKENS", `${totals.inputTokens.toLocaleString()} in / ${totals.outputTokens.toLocaleString()} out`],
    ["COST", cost],
  ];

  const rowText = rows
    .map(
      ([label, value], index) =>
        `<text x="56" y="${238 + index * 42}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" fill="#7E8CA3" letter-spacing="2">${escapeXml(
          label,
        )}</text>` +
        `<text x="200" y="${238 + index * 42}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" fill="#E8EDF5">${escapeXml(
          value,
        )}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="keyrig receipt for ${escapeXml(
    thread.title,
  )}">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E1116" />
      <stop offset="1" stop-color="#141B24" />
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#card)" />
  <circle cx="700" cy="70" r="180" fill="#22D3EE" fill-opacity="0.09" />
  <rect x="0.5" y="0.5" width="799" height="449" fill="none" stroke="#22D3EE" stroke-opacity="0.22" />
  <text x="56" y="76" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" fill="#22D3EE" letter-spacing="3">KEYRIG</text>
  <text x="56" y="146" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#F4F7FB">${escapeXml(
    cut(thread.title, 42),
  )}</text>
  <text x="56" y="178" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" fill="#7E8CA3">${totals.answers} ${
    totals.answers === 1 ? "answer" : "answers"
  } · ${new Date(thread.createdAt).toISOString().slice(0, 10)}</text>
  ${rowText}
  <line x1="56" y1="400" x2="744" y2="400" stroke="#25303F" />
  <text x="56" y="424" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" fill="#7E8CA3">Keys stay in the browser. This card holds no prompt and no key.</text>
</svg>
`;
}
