import type { KeyView } from "@keyrig/core";
import { isKeyrigError, toKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import type { ChatMessage } from "@keyrig/providers";
import type { UIMessage } from "../../lib/types";

/** A caught value as the error shape of ER-02. It never holds a key. */
export function safeError(caught: unknown): KeyrigErrorJSON {
  return isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
}

/**
 * A key failure with a second key on the device offers the other key first.
 * The category and the message stay as the provider set them (ER-02).
 */
export function withOtherKeyAction(error: KeyrigErrorJSON, hasOtherKey: boolean): KeyrigErrorJSON {
  if (!hasOtherKey) {
    return error;
  }
  if (error.category !== "auth" && error.category !== "rate_limit" && error.category !== "quota") {
    return error;
  }
  return { ...error, remediation: { action: "use_other_key" } };
}

/** PV-08: the user stopped the turn. A stop is not a failure. */
export function isCancelled(caught: unknown): boolean {
  return isKeyrigError(caught) && caught.toJSON().category === "cancelled";
}

/** The sent text only. A failed answer and an empty answer leave the history. */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.error === undefined && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
}

/**
 * KS-05: read the key cards after a turn. A sign-out can lock the vault while
 * the turn is still running, so a locked vault returns null.
 */
export function keyViewsAfterTurn(vault: { listKeys(): KeyView[] } | null): KeyView[] | null {
  if (vault === null) {
    return null;
  }
  try {
    return vault.listKeys();
  } catch {
    return null;
  }
}
