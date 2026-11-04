import { useState } from "react";
import {
  PERMISSION_LABELS,
  TOOL_SCRIPT_WARNING,
  TOOL_WARNING_TEXT,
  TOOL_WARNING_TITLE,
  permissionEffects,
  type ToolPermission,
} from "@keyrig/core";
import { Icon } from "./ui/Icon";

export interface ToolWarningRequest {
  /** What the person is about to do: create, enable, import, install or run. */
  action: string;
  toolName: string;
  permissions: ToolPermission[];
  confirmLabel: string;
  onConfirm: () => void;
}

interface ToolWarningDialogProps {
  request: ToolWarningRequest | null;
  onClose: () => void;
  error?: string | null;
}

/**
 * AS-01: the warning card. It says what the tool can do, which permissions it
 * asks for and that tool code can read data and run actions. The confirm
 * button stays disabled until the person marks the box. There is no other way
 * to confirm, so the warning cannot be skipped.
 */
export function ToolWarningDialog({ request, onClose, error }: ToolWarningDialogProps) {
  const [checked, setChecked] = useState(false);

  if (request === null) {
    return null;
  }

  const close = (): void => {
    setChecked(false);
    onClose();
  };

  const confirm = (): void => {
    setChecked(false);
    request.onConfirm();
  };

  return (
    <div className="tool-warn-backdrop" role="presentation" onClick={close}>
      <div
        className="tool-warn"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tool-warn-title"
        aria-describedby="tool-warn-text"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tool-warn-head">
          <span className="tool-warn-icon">
            <Icon name="alert" size={18} />
          </span>
          <div>
            <span className="eyebrow eyebrow--amber">{request.action}</span>
            <h2 id="tool-warn-title">{TOOL_WARNING_TITLE}</h2>
          </div>
        </header>

        <p id="tool-warn-text" className="tool-warn-text">
          {TOOL_WARNING_TEXT}
        </p>

        <div className="tool-warn-block">
          <strong>{request.toolName}</strong>
          <ul>
            {permissionEffects(request.permissions).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="hint">
            Permissions:{" "}
            {request.permissions.map((permission) => PERMISSION_LABELS[permission]).join(", ")}
          </p>
        </div>

        <p className="hint">{TOOL_SCRIPT_WARNING}</p>

        {error ? (
          <p className="inline-error callout" role="alert">
            {error}
          </p>
        ) : null}

        <label className="risk-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>I read this warning and I understand the permissions of this tool.</span>
        </label>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!checked}
            onClick={confirm}
          >
            {request.confirmLabel}
          </button>
          <button type="button" className="btn btn--quiet" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
