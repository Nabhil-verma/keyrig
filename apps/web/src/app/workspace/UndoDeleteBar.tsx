interface UndoDeleteBarProps {
  title: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/** UX-05: the announced bar that offers to restore the last deleted chat. */
export function UndoDeleteBar({ title, onUndo, onDismiss }: UndoDeleteBarProps) {
  return (
    <div className="ws-undo">
      <p className="ws-undo-text" role="status" aria-live="polite">
        Deleted “{title}”.
      </p>
      <div className="ws-undo-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
