import { createMemoryStorage } from "@keyrig/shared";
import { describe, expect, it } from "vitest";
import {
  MAX_STORED_TOOLS,
  MAX_THREADS,
  MAX_THREADS_MESSAGES,
  createThread,
  normalizeThread,
  orderThreads,
  readThreads,
  removeThread,
  restoreThread,
  threadPreview,
  titleFrom,
  upsertThread,
  writeThreads,
} from "./threads";
import type { UIMessage } from "../lib/types";

function message(id: string, role: "user" | "assistant", content: string): UIMessage {
  return { id, role, content, at: "2026-11-01T00:00:00.000Z" };
}

function thread(id: string, updatedAt: string, messages: UIMessage[] = []): ReturnType<typeof createThread> {
  return { id, title: "Plan", createdAt: "2026-11-01T00:00:00.000Z", updatedAt, messages };
}

describe("the saved chats", () => {
  it("makes a short title from the first line", () => {
    expect(titleFrom("  Plan the landing page\nand the copy  ")).toBe("Plan the landing page");
    expect(titleFrom("")).toBe("New chat");
    expect(titleFrom("x".repeat(100)).length).toBe(64);
  });

  it("starts a thread with no message", () => {
    const created = createThread(() => Date.parse("2026-11-01T10:00:00.000Z"));
    expect(created.messages).toEqual([]);
    expect(created.title).toBe("New chat");
    expect(created.updatedAt).toBe("2026-11-01T10:00:00.000Z");
  });

  it("keeps the newest thread first and caps the list", () => {
    const threads = Array.from({ length: MAX_THREADS + 4 }, (_, index) =>
      thread(`t${index}`, new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()),
    );
    const ordered = orderThreads(threads);
    expect(ordered).toHaveLength(MAX_THREADS);
    expect(ordered[0]?.id).toBe(`t${MAX_THREADS + 3}`);
  });

  it("keeps one record for one id", () => {
    const first = thread("a", "2026-11-01T00:00:00.000Z", [message("m1", "user", "one")]);
    const updated = thread("a", "2026-11-02T00:00:00.000Z", [message("m2", "user", "two")]);
    const next = upsertThread([first], updated);
    expect(next).toHaveLength(1);
    expect(next[0]?.messages[0]?.content).toBe("two");
  });

  it("cuts the messages at the write, not only at the read", () => {
    const storage = createMemoryStorage();
    const many = Array.from({ length: MAX_THREADS_MESSAGES + 5 }, (_, index) =>
      message(`m${index}`, "user", `line ${index}`),
    );
    writeThreads(storage, [thread("a", "2026-11-01T00:00:00.000Z", many)]);

    const stored = JSON.parse(storage.getItem("keyrig.threads.v1") ?? "{}");
    expect(stored.data[0].messages).toHaveLength(MAX_THREADS_MESSAGES);
    expect(stored.data[0].messages[0].content).toBe("line 5");
  });

  it("removes a thread", () => {
    expect(removeThread([thread("a", "2026-11-01T00:00:00.000Z")], "a")).toEqual([]);
  });

  it("restores a removed thread with its messages and its place", () => {
    const old = thread("old", "2026-10-31T00:00:00.000Z");
    const removed = thread("a", "2026-11-01T00:00:00.000Z", [message("m1", "user", "keep me")]);
    const newest = thread("b", "2026-11-02T00:00:00.000Z");

    const without = removeThread([newest, old, removed], "a");
    const restored = restoreThread(without, removed);

    expect(restored.map((item) => item.id)).toEqual(["b", "a", "old"]);
    expect(restored[1]?.messages[0]?.content).toBe("keep me");
  });

  it("drops a broken thread and a broken message", () => {
    expect(normalizeThread({ id: "t" })).toBeNull();
    const cleaned = normalizeThread({
      id: "t",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      messages: [null, { id: "m" }, message("m2", "user", "hi")],
    });
    expect(cleaned?.messages).toHaveLength(1);
    expect(cleaned?.messages[0]?.id).toBe("m2");
  });

  it("keeps the last messages of a long thread", () => {
    const messages = Array.from({ length: MAX_THREADS_MESSAGES + 10 }, (_, index) =>
      message(`m${index}`, "user", `line ${index}`),
    );
    const cleaned = normalizeThread({
      id: "t",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      messages,
    });
    expect(cleaned?.messages).toHaveLength(MAX_THREADS_MESSAGES);
    expect(cleaned?.messages[MAX_THREADS_MESSAGES - 1]?.id).toBe(`m${MAX_THREADS_MESSAGES + 9}`);
  });

  it("keeps at most twelve tool steps and one scene", () => {
    const tools = Array.from({ length: MAX_STORED_TOOLS + 6 }, (_, index) => ({
      id: `c${index}`,
      name: "read_file",
      title: "Read a file",
      risk: "read",
      args: { path: "a.md" },
      status: "done",
      summary: "Read a.md",
      startedAt: "2026-11-01T00:00:00.000Z",
      durationMs: 1,
    }));
    const scene = { kind: "keyrig.scene", version: 1, nodes: [], lights: [], title: "S" };
    const cleaned = normalizeThread({
      id: "t",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      messages: [{ ...message("m", "assistant", "done"), tools, scene }],
    });
    expect(cleaned?.messages[0]?.tools).toHaveLength(MAX_STORED_TOOLS);
    expect(cleaned?.messages[0]?.scene?.kind).toBe("keyrig.scene");
  });

  it("saves and reads a thread", () => {
    const storage = createMemoryStorage();
    const saved = thread("a", "2026-11-01T00:00:00.000Z", [message("m1", "user", "hello")]);
    writeThreads(storage, [saved]);
    const read = readThreads(storage);
    expect(read).toHaveLength(1);
    expect(read[0]?.messages[0]?.content).toBe("hello");
  });

  it("reads an empty record as no thread", () => {
    expect(readThreads(createMemoryStorage())).toEqual([]);
  });

  it("previews the user text", () => {
    expect(threadPreview(thread("a", "2026-11-01T00:00:00.000Z", [message("m1", "user", "hello\nthere")]))).toBe(
      "hello there",
    );
    expect(threadPreview(thread("b", "2026-11-01T00:00:00.000Z"))).toBe("");
  });
});
