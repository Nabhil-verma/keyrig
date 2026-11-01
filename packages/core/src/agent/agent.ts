import { KeyrigError } from "@keyrig/shared";
import type { ChatMessage, ToolCall, ToolSpec } from "@keyrig/providers";
import {
  MAX_AGENT_STEPS,
  MAX_TOOL_RESULT_CHARS,
  describeCall,
  findTool,
  requiresApproval,
  specsFor,
  validateToolArguments,
  type ToolDefinition,
  type ToolRisk,
} from "./tools";

/**
 * Phase 3: the agent loop (AS-01).
 *
 * One turn is a short loop:
 *   1. Ask the model. Give it the tools that the user enabled.
 *   2. If the model asks for nothing, the turn is done.
 *   3. For each call: check the name, validate the arguments, ask the user,
 *      run the tool, then send the result back.
 *
 * The loop stops at MAX_AGENT_STEPS, so a model cannot run forever. A deny is
 * a result, not an error: the model reads "the user denied this" and stops.
 */

export type ToolStatus = "running" | "done" | "denied" | "blocked" | "error";

export interface AgentEvent {
  id: string;
  name: string;
  title: string;
  risk: ToolRisk;
  args: Record<string, unknown>;
  status: ToolStatus;
  summary: string;
  startedAt: string;
  durationMs: number;
  data?: unknown;
}

export interface AgentApprovalRequest {
  call: ToolCall;
  tool: ToolDefinition;
  args: Record<string, unknown>;
  summary: string;
}

export interface ToolExecution {
  ok: boolean;
  summary: string;
  data?: unknown;
}

export interface AgentReply {
  text: string;
  toolCalls: ToolCall[];
}

export interface AgentOptions {
  messages: readonly ChatMessage[];
  /** The tool names that the user turned on. */
  enabled: readonly string[];
  /** True when the user allows a write without a prompt for each call. */
  autoApproveWrites: boolean;
  maxSteps?: number;
  signal?: AbortSignal;
  now?: () => number;
  callModel: (messages: ChatMessage[], tools: ToolSpec[]) => Promise<AgentReply>;
  approve: (request: AgentApprovalRequest) => Promise<"approve" | "deny">;
  execute: (input: { call: ToolCall; tool: ToolDefinition; args: Record<string, unknown> }) => Promise<ToolExecution>;
  /** A tool that cannot run now, with the reason. Example: GitHub is not connected. */
  blockedReason?: (tool: ToolDefinition) => string | null;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentOutcome {
  text: string;
  events: AgentEvent[];
  steps: number;
  hitLimit: boolean;
}

function resultText(value: ToolExecution): string {
  const text = JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }
  return JSON.stringify({
    ok: value.ok,
    summary: `${value.summary} The result was too long, so keyrig cut it. Read the file again for one part.`,
  });
}

export async function runAgentTurn(options: AgentOptions): Promise<AgentOutcome> {
  const wantedSteps = options.maxSteps ?? MAX_AGENT_STEPS;
  const maxSteps = Math.min(12, Math.max(1, Math.floor(wantedSteps)));
  const enabled = new Set(options.enabled);
  const now = options.now ?? (() => Date.now());
  const history: ChatMessage[] = [...options.messages];
  const events: AgentEvent[] = [];
  const tools = specsFor([...enabled]);
  let finalText = "";
  let steps = 0;

  const emit = (event: AgentEvent): void => {
    events.push(event);
    options.onEvent?.(event);
  };
  // A helper, so a narrowing from the first check does not reach the loop.
  const stopped = (): boolean => options.signal?.aborted === true;

  for (let step = 0; step < maxSteps; step += 1) {
    if (stopped()) {
      throw KeyrigError.fromCategory("cancelled");
    }
    steps = step + 1;
    const reply = await options.callModel(history, tools);
    if (reply.text.trim().length > 0) {
      finalText = reply.text;
    }
    const calls = reply.toolCalls;
    if (calls.length === 0) {
      return { text: reply.text, events, steps, hitLimit: false };
    }

    history.push({ role: "assistant", content: reply.text, toolCalls: calls });

    for (const call of calls) {
      if (stopped()) {
        throw KeyrigError.fromCategory("cancelled");
      }
      const startedAt = new Date(now()).toISOString();
      const started = now();
      const finish = (status: ToolStatus, summary: string, tool: ToolDefinition, args: Record<string, unknown>, data?: unknown): void => {
        // One row per call. A final state replaces the running row.
        if (status !== "running") {
          const running = events.findIndex((event) => event.id === call.id && event.status === "running");
          if (running !== -1) {
            events.splice(running, 1);
          }
        }
        emit({
          id: call.id,
          name: tool.name,
          title: tool.title,
          risk: tool.risk,
          args,
          status,
          summary,
          startedAt,
          durationMs: Math.max(0, now() - started),
          ...(data !== undefined ? { data } : {}),
        });
      };

      const tool = findTool(call.name);
      if (tool === undefined || !enabled.has(tool.name)) {
        const summary = `${call.name} is not an enabled tool. keyrig ran nothing.`;
        finish("blocked", summary, tool ?? unknownTool(call.name), {});
        history.push({ role: "tool", toolCallId: call.id, content: resultText({ ok: false, summary }) });
        continue;
      }

      let args: Record<string, unknown>;
      try {
        args = validateToolArguments(tool, call.arguments);
      } catch (caught) {
        const summary = caught instanceof Error ? caught.message : "The arguments are not valid.";
        finish("blocked", summary, tool, {});
        history.push({ role: "tool", toolCallId: call.id, content: resultText({ ok: false, summary }) });
        continue;
      }

      const blocked = options.blockedReason?.(tool) ?? null;
      if (blocked !== null) {
        finish("blocked", blocked, tool, args);
        history.push({ role: "tool", toolCallId: call.id, content: resultText({ ok: false, summary: blocked }) });
        continue;
      }

      const summary = describeCall(tool, args);
      if (requiresApproval(tool, { autoApproveWrites: options.autoApproveWrites })) {
        const decision = await options.approve({ call, tool, args, summary });
        if (decision !== "approve") {
          const denied = "The user denied this action. Do not try it again.";
          finish("denied", denied, tool, args);
          history.push({ role: "tool", toolCallId: call.id, content: resultText({ ok: false, summary: denied }) });
          continue;
        }
      }

      finish("running", summary, tool, args);
      let result: ToolExecution;
      try {
        result = await options.execute({ call, tool, args });
      } catch (caught) {
        const message = caught instanceof KeyrigError ? caught.message : toMessage(caught);
        finish("error", message, tool, args);
        history.push({ role: "tool", toolCallId: call.id, content: resultText({ ok: false, summary: message }) });
        continue;
      }

      finish(result.ok ? "done" : "error", result.summary, tool, args, result.data);
      history.push({ role: "tool", toolCallId: call.id, content: resultText(result) });
    }
  }

  return { text: finalText, events, steps, hitLimit: true };
}

function toMessage(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0 ? caught.message : "The tool failed.";
}

function unknownTool(name: string): ToolDefinition {
  return {
    name,
    title: name,
    description: "",
    risk: "read",
    effects: [],
    alwaysAsk: false,
    needsGithub: false,
    parameters: { type: "object", properties: {} },
  };
}
