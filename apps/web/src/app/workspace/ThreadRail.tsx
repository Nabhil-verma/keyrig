import { ROLE_LABELS, budgetState, can, type RoleId } from "@keyrig/core";
import { formatUsd } from "@keyrig/providers";
import type { ShelfTab } from "../../components/Shelf";
import { threadPreview, type StoredThread } from "../../stores/threads";
import { Icon } from "../../components/ui/Icon";
import { Link } from "../router";

interface ThreadRailProps {
  username: string;
  role: RoleId | null;
  threads: StoredThread[];
  activeId: string;
  search: string;
  onSearch: (value: string) => void;
  onNewChat: () => void;
  onOpenThread: (thread: StoredThread) => void;
  onDeleteThread: (id: string) => void;
  budget: ReturnType<typeof budgetState>;
  budgetStop: boolean;
  onContinue: () => void;
  onOpenShelf: (tab: ShelfTab) => void;
}

/** The left rail: the saved chats, the budget meter and the setup links. */
export function ThreadRail({
  username,
  role,
  threads,
  activeId,
  search,
  onSearch,
  onNewChat,
  onOpenThread,
  onDeleteThread,
  budget,
  budgetStop,
  onContinue,
  onOpenShelf,
}: ThreadRailProps) {
  return (
    <aside className="ws-rail">
      <button type="button" className="btn btn--primary btn--sm ws-new" onClick={onNewChat}>
        <Icon name="plus" size={13} />
        New chat
      </button>

      <label className="ws-search">
        <Icon name="search" size={13} />
        <input
          value={search}
          placeholder="Search chats"
          aria-label="Search chats"
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>

      <ol className="ws-threads">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className="ws-thread"
              aria-current={thread.id === activeId}
              onClick={() => onOpenThread(thread)}
            >
              <span className="ws-thread-title">{thread.title}</span>
              <span className="ws-thread-preview">{threadPreview(thread) || "No message yet"}</span>
              <span className="ws-thread-meta">
                {thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}
              </span>
            </button>
            <button
              type="button"
              className="ws-thread-del"
              aria-label={`Delete ${thread.title}`}
              onClick={() => onDeleteThread(thread.id)}
            >
              <Icon name="trash" size={12} />
            </button>
          </li>
        ))}
      </ol>

      <div className="ws-budget">
        <div className="ws-budget-row">
          <span>{budget.limitUsd === null ? "Today" : "Budget"}</span>
          <strong className="mono">
            {budget.limitUsd === null
              ? formatUsd(budget.spentUsd)
              : `${formatUsd(budget.spentUsd)} / ${formatUsd(budget.limitUsd)}`}
          </strong>
        </div>
        <div className="ws-budget-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.round(budget.ratio * 100))}%` }} />
        </div>
        {budgetStop ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onContinue}>
            Continue this session
          </button>
        ) : null}
      </div>

      <footer className="ws-rail-foot">
        <span className="ws-status">
          <span className="ws-dot" />
          {username}
          {role ? ` · ${ROLE_LABELS[role]}` : ""}
        </span>
        <span className="ws-status">No keyrig server · Telemetry off</span>
        <div className="ws-rail-buttons">
          <button type="button" onClick={() => onOpenShelf("keys")}>
            Keys
          </button>
          <button type="button" onClick={() => onOpenShelf("profile")}>
            Profile
          </button>
          {role !== null && can(role, "roles.assign") ? (
            <button type="button" onClick={() => onOpenShelf("roles")}>
              Roles
            </button>
          ) : null}
          <Link to="/settings">Settings</Link>
        </div>
      </footer>
    </aside>
  );
}

