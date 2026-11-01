import { useEffect, type ReactNode } from "react";
import { Icon } from "./ui/Icon";

/**
 * The setup drawer. The keys, the profile and the roles leave the main screen,
 * so the workspace keeps its width for the chat and the inspector.
 */
export type ShelfTab = "keys" | "profile" | "roles";

const TABS: ReadonlyArray<{ id: ShelfTab; label: string }> = [
  { id: "keys", label: "Keys" },
  { id: "profile", label: "Profile" },
  { id: "roles", label: "Roles" },
];

interface ShelfProps {
  open: boolean;
  tab: ShelfTab;
  onTab: (tab: ShelfTab) => void;
  onClose: () => void;
  keys: ReactNode;
  profile: ReactNode;
  roles: ReactNode | null;
}

export function Shelf({ open, tab, onTab, onClose, keys, profile, roles }: ShelfProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ws-shelf-backdrop" onClick={onClose}>
      <aside
        className="ws-shelf"
        role="dialog"
        aria-modal="true"
        aria-label="Account setup"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ws-shelf-head">
          <div className="ws-tabs" role="tablist" aria-label="Setup">
            {TABS.filter((item) => item.id !== "roles" || roles !== null).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className="ws-tab"
                onClick={() => onTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-button ws-close" aria-label="Close" onClick={onClose}>
            <Icon name="plus" size={16} />
          </button>
        </header>
        <div className="ws-shelf-body">{tab === "keys" ? keys : tab === "profile" ? profile : roles}</div>
      </aside>
    </div>
  );
}
