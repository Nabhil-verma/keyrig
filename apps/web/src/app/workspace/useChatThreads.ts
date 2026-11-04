import { useEffect, useMemo, useRef, useState } from "react";
import { accountStorage } from "@keyrig/core";
import type { StorageLike } from "@keyrig/shared";
import type { ArenaRun, UIMessage } from "../../lib/types";
import {
  atThreadCap,
  createThread,
  MAX_THREADS,
  readThreads,
  removeThread as removeThreadFromList,
  restoreThread,
  titleFrom,
  upsertThread,
  writeThreads,
  type StoredThread,
} from "../../stores/threads";
import { useUndoDelete } from "./useUndoDelete";

interface UseChatThreadsOptions {
  storage: StorageLike;
  username: string | null;
  /** A stream is open, so a delete would leave it without a home. */
  canDelete: boolean;
  /** Stop a running answer, but keep the approval card. */
  onAbortTurn: () => void;
  /** Stop the answer and close any approval card. */
  onLeaveThread: () => void;
  onShowChat: () => void;
}

/** The saved chats of the open account, the open chat and the undo window. */
export function useChatThreads(options: UseChatThreadsOptions) {
  const { storage, username, canDelete, onAbortTurn, onLeaveThread, onShowChat } = options;
  const accountStore = useMemo(
    () => (username === null ? null : accountStorage(storage, username)),
    [storage, username],
  );

  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [arenaRun, setArenaRun] = useState<ArenaRun | null>(null);
  const threadsRef = useRef<StoredThread[]>([]);
  const undo = useUndoDelete();

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  /** The record follows the open chat, but not on every keystroke. */
  useEffect(() => {
    if (accountStore === null || activeId.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const current = threadsRef.current.find((thread) => thread.id === activeId);
      const now = new Date().toISOString();
      const next = upsertThread(threadsRef.current, {
        id: activeId,
        title: titleFor(messages, current),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        messages,
        ...(arenaRun !== null ? { arena: arenaRun } : {}),
      });
      writeThreads(accountStore, next);
      setThreads(next);
    }, 400);
    return () => clearTimeout(timer);
  }, [messages, activeId, accountStore, arenaRun]);

  const persist = (next: StoredThread[]): void => {
    setThreads(next);
    threadsRef.current = next;
    if (accountStore !== null) {
      writeThreads(accountStore, next);
    }
  };

  /** Read the chats of a signed-in account and open its newest one. */
  const loadAccount = (name: string): void => {
    const store = accountStorage(storage, name);
    const saved = readThreads(store);
    const first = saved[0] ?? createThread();
    const list = saved.length > 0 ? saved : [first];
    if (saved.length === 0) {
      writeThreads(store, list);
    }
    setThreads(list);
    threadsRef.current = list;
    setActiveId(first.id);
    setMessages(first.messages);
    setArenaRun(first.arena ?? null);
  };

  const clear = (): void => {
    undo.clear();
    setThreads([]);
    threadsRef.current = [];
    setActiveId("");
    setMessages([]);
    setArenaRun(null);
  };

  const openThread = (thread: StoredThread): void => {
    onLeaveThread();
    setActiveId(thread.id);
    setMessages(thread.messages);
    setArenaRun(thread.arena ?? null);
    onShowChat();
  };

  const newChat = (): void => {
    onAbortTurn();
    const current = threadsRef.current.find((thread) => thread.id === activeId);
    if (current !== undefined && current.messages.length === 0) {
      setMessages([]);
      onShowChat();
      return;
    }
    if (
      atThreadCap(threadsRef.current) &&
      !window.confirm(
        `This device keeps ${MAX_THREADS} chats. A new chat removes the oldest one. Continue?`,
      )
    ) {
      return;
    }
    const thread = createThread();
    persist(upsertThread(threadsRef.current, thread));
    setActiveId(thread.id);
    setMessages([]);
    setArenaRun(null);
    onShowChat();
  };

  const deleteThread = (id: string): void => {
    if (!canDelete) {
      return;
    }
    const deleted = threadsRef.current.find((thread) => thread.id === id);
    const next = removeThreadFromList(threadsRef.current, id);
    persist(next);
    if (deleted !== undefined) {
      undo.arm(deleted);
    }
    if (id !== activeId) {
      return;
    }
    const fallback = next[0];
    if (fallback === undefined) {
      const fresh = createThread();
      persist(upsertThread(next, fresh));
      setActiveId(fresh.id);
      setMessages([]);
      setArenaRun(null);
      return;
    }
    setActiveId(fallback.id);
    setMessages(fallback.messages);
    setArenaRun(fallback.arena ?? null);
  };

  const undoLastDelete = (): void => {
    if (undo.pending === null) {
      return;
    }
    const restored = undo.pending;
    undo.clear();
    persist(restoreThread(threadsRef.current, restored));
  };

  /** The open chat with its live messages, for an export or a receipt. */
  const threadForExport = (): StoredThread | null => {
    if (messages.length === 0) {
      return null;
    }
    const stored = threadsRef.current.find((thread) => thread.id === activeId);
    const at = new Date().toISOString();
    return {
      id: activeId,
      title: titleFor(messages, stored),
      createdAt: stored?.createdAt ?? at,
      updatedAt: at,
      messages,
    };
  };

  return {
    threads,
    activeId,
    activeThread: threads.find((thread) => thread.id === activeId),
    messages,
    setMessages,
    arenaRun,
    setArenaRun,
    pendingUndo: undo.pending,
    loadAccount,
    clear,
    openThread,
    newChat,
    deleteThread,
    undoLastDelete,
    dismissUndo: undo.clear,
    threadForExport,
  };
}

/** The saved title, or one from the first prompt when the chat is still new. */
function titleFor(messages: readonly UIMessage[], current: StoredThread | undefined): string {
  if (current !== undefined && current.title !== "New chat") {
    return current.title;
  }
  const firstUser = messages.find((message) => message.role === "user");
  return firstUser === undefined ? "New chat" : titleFrom(firstUser.display ?? firstUser.content);
}
