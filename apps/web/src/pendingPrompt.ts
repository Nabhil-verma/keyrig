/**
 * A skill sends its prompt to the chat composer. The workspace stays mounted
 * while the settings page is open, so the panel also listens for the event.
 * The stored copy covers a panel that mounts after the page changes.
 */
const PENDING_KEY = "keyrig.pending-prompt.v1";

export const USE_PROMPT_EVENT = "keyrig:use-prompt";

export function requestPromptUse(prompt: string): void {
  try {
    window.localStorage.setItem(PENDING_KEY, prompt);
  } catch {
    // The event below still reaches a mounted chat panel.
  }
  window.dispatchEvent(new CustomEvent<string>(USE_PROMPT_EVENT, { detail: prompt }));
}

export function takePendingPrompt(): string | null {
  try {
    const value = window.localStorage.getItem(PENDING_KEY);
    if (value === null) {
      return null;
    }
    window.localStorage.removeItem(PENDING_KEY);
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
