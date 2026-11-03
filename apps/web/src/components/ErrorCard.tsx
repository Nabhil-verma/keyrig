import { useEffect, useState } from "react";
import type { KeyrigErrorJSON } from "@keyrig/shared";
import { Icon } from "./ui/Icon";

const ACTION_LABEL: Record<string, string> = {
  retry: "Try again",
  wait: "Wait",
  switch_model: "Change model",
  check_key: "Open keys",
  use_other_key: "Use another key",
  reduce_context: "Shorten the chat",
  change_prompt: "Change the prompt",
  check_network: "Check the network",
  check_settings: "Open settings",
  none: "Close",
};

interface ErrorCardProps {
  error: KeyrigErrorJSON;
  onAction: (action: string) => void;
}

/** A provider that sends no wait hint still holds the button for a moment. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 4000;

/** ER-05: the rate limit starts a wait with a visible timer. */
export function ErrorCard({ error, onAction }: ErrorCardProps) {
  const hinted = typeof error.details.retryAfterMs === "number" ? error.details.retryAfterMs : undefined;
  const waitMs = hinted ?? (error.category === "rate_limit" ? DEFAULT_RATE_LIMIT_WAIT_MS : undefined);
  const [remaining, setRemaining] = useState(waitMs ? Math.ceil(waitMs / 1000) : 0);

  useEffect(() => {
    if (waitMs === undefined) {
      return;
    }
    setRemaining(Math.ceil(waitMs / 1000));
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitMs]);

  const action = error.remediation.action;
  const disabled = action === "wait" && remaining > 0;

  return (
    <div className="error-card" role="alert">
      <span className="error-glyph">
        <Icon name="alert" size={17} />
      </span>
      <div className="error-main">
        <div className="error-head">
          <span className="error-category">{error.category.replaceAll("_", " ")}</span>
          <code className="error-code">{error.code}</code>
        </div>
        <p>{error.message}</p>
        <div className="error-actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={disabled}
            onClick={() => onAction(action === "wait" ? "retry" : action)}
          >
            {action === "wait" && remaining > 0
              ? `Wait ${remaining}s`
              : (ACTION_LABEL[action] ?? "Try again")}
          </button>
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => onAction("dismiss")}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
