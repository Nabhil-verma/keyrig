import { describe, expect, it } from "vitest";
import type { ToolCall } from "@keyrig/providers";
import { runAgentTurn } from "../agent";

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call_${name}`, name, arguments: JSON.stringify(args) };
}

const base = {
  messages: [{ role: "user" as const, content: "write a plan" }],
  enabled: ["write_file"],
  autoApproveWrites: true,
};

describe("AS-01 the agent loop", () => {
  it("runs a tool, sends the result back and returns the final text", async () => {
    const written: string[] = [];
    const outcome = await runAgentTurn({
      ...base,
      callModel: async (messages) => {
        if (messages.length === 1) {
          return { text: "", toolCalls: [call("write_file", { path: "notes/a.md", content: "hi" })] };
        }
        const last = messages[messages.length - 1];
        expect(last?.role).toBe("tool");
        expect(last?.toolCallId).toBe("call_write_file");
        return { text: "The file is ready.", toolCalls: [] };
      },
      approve: async () => "approve",
      execute: async ({ args }) => {
        written.push(String(args.path));
        return { ok: true, summary: "Wrote notes/a.md" };
      },
    });

    expect(outcome.text).toBe("The file is ready.");
    expect(outcome.steps).toBe(2);
    expect(outcome.hitLimit).toBe(false);
    expect(written).toEqual(["notes/a.md"]);
    expect(outcome.events).toHaveLength(1);
    expect(outcome.events[0]?.status).toBe("done");
    expect(outcome.events[0]?.risk).toBe("write");
  });

  it("does not run a tool that the user denied", async () => {
    const ran: string[] = [];
    const outcome = await runAgentTurn({
      ...base,
      autoApproveWrites: false,
      callModel: async (messages) =>
        messages.length === 1
          ? { text: "", toolCalls: [call("write_file", { path: "a.md", content: "x" })] }
          : { text: "I stopped.", toolCalls: [] },
      approve: async () => "deny",
      execute: async () => {
        ran.push("ran");
        return { ok: true, summary: "Wrote the file." };
      },
    });

    expect(ran).toEqual([]);
    expect(outcome.text).toBe("I stopped.");
    expect(outcome.events[0]?.status).toBe("denied");
  });

  it("does not ask, and does not run, a tool that the user did not enable", async () => {
    let asked = false;
    const outcome = await runAgentTurn({
      ...base,
      enabled: [],
      callModel: async (messages) =>
        messages.length === 1
          ? { text: "", toolCalls: [call("read_file", { path: "a.md" })] }
          : { text: "I cannot read the file.", toolCalls: [] },
      approve: async () => {
        asked = true;
        return "approve";
      },
      execute: async () => ({ ok: true, summary: "Read the file." }),
    });

    expect(asked).toBe(false);
    expect(outcome.events[0]?.status).toBe("blocked");
    expect(outcome.events[0]?.summary).toContain("not an enabled tool");
  });

  it("blocks a call with a missing field before the approval", async () => {
    let asked = false;
    const outcome = await runAgentTurn({
      ...base,
      autoApproveWrites: false,
      callModel: async (messages) =>
        messages.length === 1
          ? { text: "", toolCalls: [call("write_file", { path: "a.md" })] }
          : { text: "I need the text.", toolCalls: [] },
      approve: async () => {
        asked = true;
        return "approve";
      },
      execute: async () => ({ ok: true, summary: "Wrote the file." }),
    });

    expect(asked).toBe(false);
    expect(outcome.events[0]?.status).toBe("blocked");
    expect(outcome.events[0]?.summary).toContain("content");
  });

  it("stops at the step limit, so a model cannot run forever", async () => {
    const outcome = await runAgentTurn({
      ...base,
      maxSteps: 2,
      callModel: async () => ({ text: "Working.", toolCalls: [call("write_file", { path: "a.md", content: "x" })] }),
      approve: async () => "approve",
      execute: async () => ({ ok: true, summary: "Wrote a.md" }),
    });

    expect(outcome.steps).toBe(2);
    expect(outcome.hitLimit).toBe(true);
    expect(outcome.text).toBe("Working.");
  });

  it("reports a tool failure to the model and keeps the turn alive", async () => {
    const outcome = await runAgentTurn({
      ...base,
      callModel: async (messages) =>
        messages.length === 1
          ? { text: "", toolCalls: [call("write_file", { path: "a.md", content: "x" })] }
          : { text: "The write failed. Try another path.", toolCalls: [] },
      approve: async () => "approve",
      execute: async () => {
        throw new Error("The browser storage is full.");
      },
    });

    expect(outcome.events[0]?.status).toBe("error");
    expect(outcome.events[0]?.summary).toBe("The browser storage is full.");
    expect(outcome.text).toBe("The write failed. Try another path.");
  });

  it("stops a call to a tool that cannot run now", async () => {
    const outcome = await runAgentTurn({
      ...base,
      enabled: ["github_commit"],
      autoApproveWrites: true,
      callModel: async (messages) =>
        messages.length === 1
          ? { text: "", toolCalls: [call("github_commit", { message: "Add the plan" })] }
          : { text: "Connect GitHub first.", toolCalls: [] },
      approve: async () => "approve",
      execute: async () => ({ ok: true, summary: "Committed." }),
      blockedReason: () => "Connect GitHub first.",
    });

    expect(outcome.events[0]?.status).toBe("blocked");
    expect(outcome.events[0]?.summary).toBe("Connect GitHub first.");
  });

  it("does not start when the user stopped the turn", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runAgentTurn({
        ...base,
        signal: controller.signal,
        callModel: async () => ({ text: "Hello", toolCalls: [] }),
        approve: async () => "approve",
        execute: async () => ({ ok: true, summary: "" }),
      }),
    ).rejects.toMatchObject({ category: "cancelled" });
  });
});
