import { isKeyrigError, toKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import type { ChatMessage } from "@keyrig/providers";
import type { UIMessage } from "../../lib/types";

/** A caught value as the error shape of ER-02. It never holds a key. */
export function safeError(caught: unknown): KeyrigErrorJSON {
  return isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
}

/** The sent text only. A failed answer and an empty answer leave the history. */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.error === undefined && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
}
