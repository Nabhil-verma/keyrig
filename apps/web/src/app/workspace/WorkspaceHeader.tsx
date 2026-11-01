import { formatUsd } from "@keyrig/providers";
import { BrandLockup } from "../../components/ui/BrandLockup";
import { Icon } from "../../components/ui/Icon";

export type WorkspaceView = "chat" | "arena";

interface WorkspaceHeaderProps {
  username: string;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  /** The cost of this session only. */
  totalCost: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSignOut: () => void;
}

/** The top bar of the workspace: the brand, the view tabs and the session actions. */
export function WorkspaceHeader({
  username,
  view,
  onView,
  totalCost,
  theme,
  onToggleTheme,
  onSignOut,
}: WorkspaceHeaderProps) {
  return (
    <header className="ws-top">
      <span className="ws-brand">
        <BrandLockup height={24} />
      </span>

      <div className="ws-top-tabs" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={view === "chat"}
          className="ws-top-tab"
          onClick={() => onView("chat")}
        >
          <Icon name="chat" size={13} />
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "arena"}
          className="ws-top-tab"
          onClick={() => onView("arena")}
        >
          <Icon name="arena" size={13} />
          Arena
        </button>
      </div>

      <div className="ws-top-actions">
        <span className="status-chip" data-state="unlocked">
          <span className="status-dot" />
          {username}
        </span>
        <span className="chip mono" title="The cost of this session">
          {formatUsd(totalCost)}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
          onClick={onToggleTheme}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-label={`Sign out of ${username}`}
          onClick={onSignOut}
        >
          <Icon name="lock" size={12} />
          Sign out
        </button>
      </div>
    </header>
  );
}
