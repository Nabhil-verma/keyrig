import type { AgentEvent, KeyrigScene } from "@keyrig/core";
import { createDocument, isVersionedDocument, type StorageLike } from "@keyrig/shared";
import type { UIMessage } from "../lib/types";

/**
 * AR-03 and AR-06: the saved chats of one account.
 *
 * A thread holds the messages, the tool calls and the scene of each answer. A
 * reload keeps the work. The record lives in this browser, for one account,
 * and it holds no key.
 */

export const THREADS_STORAGE_KEY = "keyrig.threads.v1";
export const THREADS_SCHEMA_VERSION = 1;
export const MAX_THREADS = 50;
export const MAX_THREADS_MESSAGES = 200;
export const MAX_STORED_TOOLS = 12;
export const TITLE_LIMIT = 64;
export const NEW_THREAD_TITLE = "New chat";

export interface StoredThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UIMessage[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A short title from the first line of the prompt. */
export function titleFrom(text: string): string {
  const line = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (line === undefined) {
    return NEW_THREAD_TITLE;
  }
  return line.length > TITLE_LIMIT ? `${line.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : line;
}

export function newThreadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createThread(now: () => number = () => Date.now()): StoredThread {
  const at = new Date(now()).toISOString();
  return { id: newThreadId(), title: NEW_THREAD_TITLE, createdAt: at, updatedAt: at, messages: [] };
}

function readToolEvent(value: unknown): AgentEvent | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = stringOrNull(value.id);
  const name = stringOrNull(value.name);
  const status = stringOrNull(value.status);
  if (id === null || name === null || status === null) {
    return null;
  }
  return {
    id,
    name,
    title: stringOrNull(value.title) ?? name,
    risk: (stringOrNull(value.risk) ?? "read") as AgentEvent["risk"],
    args: isPlainObject(value.args) ? value.args : {},
    status: status as AgentEvent["status"],
    summary: stringOrNull(value.summary) ?? "",
    startedAt: stringOrNull(value.startedAt) ?? new Date(0).toISOString(),
    durationMs: numberOrNull(value.durationMs) ?? 0,
    ...(value.data !== undefined ? { data: value.data } : {}),
  };
}

function readScene(value: unknown): KeyrigScene | null {
  if (!isPlainObject(value) || value.kind !== "keyrig.scene" || !Array.isArray(value.nodes)) {
    return null;
  }
  return value as unknown as KeyrigScene;
}

function readMessage(value: unknown): UIMessage | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = stringOrNull(value.id);
  const content = stringOrNull(value.content);
  const at = stringOrNull(value.at);
  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  if (id === null || content === null || at === null || role === null) {
    return null;
  }
  const message: UIMessage = { id, role, content, at };
  const display = stringOrNull(value.display);
  if (display !== null) {
    message.display = display;
  }
  const model = stringOrNull(value.model);
  if (model !== null) {
    message.model = model;
  }
  const providerId = stringOrNull(value.providerId);
  if (providerId !== null) {
    message.providerId = providerId;
  }
  const keyLabel = stringOrNull(value.keyLabel);
  if (keyLabel !== null) {
    message.keyLabel = keyLabel;
  }
  const costUsd = numberOrNull(value.costUsd);
  if (costUsd !== null) {
    message.costUsd = costUsd;
  }
  if (typeof value.pricingKnown === "boolean") {
    message.pricingKnown = value.pricingKnown;
  }
  const inputTokens = numberOrNull(value.inputTokens);
  if (inputTokens !== null) {
    message.inputTokens = inputTokens;
  }
  const outputTokens = numberOrNull(value.outputTokens);
  if (outputTokens !== null) {
    message.outputTokens = outputTokens;
  }
  const cachedTokens = numberOrNull(value.cachedTokens);
  if (cachedTokens !== null) {
    message.cachedTokens = cachedTokens;
  }
  if (value.cacheState === "hit" || value.cacheState === "none") {
    message.cacheState = value.cacheState;
  }
  const stopReason = stringOrNull(value.stopReason);
  if (stopReason !== null) {
    message.stopReason = stopReason;
  }
  if (isPlainObject(value.error)) {
    message.error = value.error as unknown as NonNullable<UIMessage["error"]>;
  }
  if (Array.isArray(value.tools)) {
    const tools = (value.tools as unknown[])
      .map(readToolEvent)
      .filter((event): event is AgentEvent => event !== null)
      .slice(0, MAX_STORED_TOOLS);
    if (tools.length > 0) {
      message.tools = tools;
    }
  }
  const scene = readScene(value.scene);
  if (scene !== null) {
    message.scene = scene;
  }
  return message;
}

export function normalizeThread(value: unknown): StoredThread | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = stringOrNull(value.id);
  const createdAt = stringOrNull(value.createdAt);
  const updatedAt = stringOrNull(value.updatedAt);
  if (id === null || createdAt === null || updatedAt === null) {
    return null;
  }
  const title = stringOrNull(value.title) ?? NEW_THREAD_TITLE;
  const rawMessages = Array.isArray(value.messages) ? (value.messages as unknown[]) : [];
  const messages = rawMessages
    .map(readMessage)
    .filter((message): message is UIMessage => message !== null)
    .slice(-MAX_THREADS_MESSAGES);
  return {
    id,
    title: title.length > 0 ? title.slice(0, TITLE_LIMIT) : NEW_THREAD_TITLE,
    createdAt,
    updatedAt,
    messages,
  };
}

/** Newest first, then a cap. One account cannot fill the storage with chats. */
export function orderThreads(threads: readonly StoredThread[]): StoredThread[] {
  return [...threads]
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0))
    .slice(0, MAX_THREADS);
}

export function readThreads(storage: StorageLike): StoredThread[] {
  let raw: string | null;
  try {
    raw = storage.getItem(THREADS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isVersionedDocument(parsed) || parsed.schemaVersion !== THREADS_SCHEMA_VERSION) {
    return [];
  }
  if (!Array.isArray(parsed.data)) {
    return [];
  }
  return orderThreads(
    (parsed.data as unknown[])
      .map(normalizeThread)
      .filter((thread): thread is StoredThread => thread !== null),
  );
}

export function writeThreads(storage: StorageLike, threads: readonly StoredThread[]): void {
  try {
    storage.setItem(
      THREADS_STORAGE_KEY,
      JSON.stringify(createDocument(THREADS_SCHEMA_VERSION, orderThreads(threads))),
    );
  } catch {
    // A full storage must not stop a chat.
  }
}

export function upsertThread(threads: readonly StoredThread[], thread: StoredThread): StoredThread[] {
  const next = threads.filter((item) => item.id !== thread.id);
  return orderThreads([thread, ...next]);
}

export function removeThread(threads: readonly StoredThread[], id: string): StoredThread[] {
  return threads.filter((thread) => thread.id !== id);
}

/** The first line of the thread text, for the rail. */
export function threadPreview(thread: StoredThread): string {
  const assistant = thread.messages.find((message) => message.role === "assistant" && message.content.length > 0);
  const user = thread.messages.find((message) => message.role === "user");
  const text = (user?.display ?? user?.content ?? assistant?.content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 96 ? `${text.slice(0, 95)}…` : text;
}
