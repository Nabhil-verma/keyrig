import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredThread } from "../../stores/threads";

/** UX-05: how long a deleted chat waits for an undo. */
const UNDO_DELETE_MS = 8_000;

export function useUndoDelete() {
  const [pending, setPending] = useState<StoredThread | null>(null);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPending(null);
  }, []);

  /** A second delete replaces the first. */
  const arm = useCallback((thread: StoredThread): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setPending(thread);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPending(null);
    }, UNDO_DELETE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { pending, arm, clear };
}
