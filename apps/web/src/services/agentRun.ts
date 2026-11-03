import {
  MAX_COMMIT_FILES,
  MAX_TOOL_RESULT_CHARS,
  commitFiles,
  parseScene,
  runAgentTurn,
  type AgentApprovalRequest,
  type AgentEvent,
  type KeyrigScene,
  type ToolDefinition,
  type ToolExecution,
} from "@keyrig/core";
import type { ChatMessage, ToolCall, ToolSpec } from "@keyrig/providers";
import type { Workspace } from "../stores/workspace";

/**
 * AS-01 to AS-05: the wire between the agent loop and the browser.
 *
 * The loop lives in the core. This file gives it the workspace, the model call
 * and the GitHub connection. Every effect stays here, in the app layer.
 */

interface GithubState {
  token: string | null;
  owner: string;
  repo: string;
  branch: string;
  allowCommit: boolean;
}

interface ToolTurnOptions {
  messages: ChatMessage[];
  enabled: string[];
  autoApproveWrites: boolean;
  signal?: AbortSignal;
  workspace: Workspace;
  callModel: (messages: ChatMessage[], tools: ToolSpec[]) => Promise<{ text: string; toolCalls: ToolCall[] }>;
  approve: (request: AgentApprovalRequest) => Promise<"approve" | "deny">;
  github: GithubState;
  onScene: (scene: KeyrigScene) => void;
  onEvent: (event: AgentEvent) => void;
}

interface ToolTurnOutcome {
  text: string;
  events: AgentEvent[];
  hitLimit: boolean;
}

function readyGithub(github: GithubState): boolean {
  return github.token !== null && github.allowCommit && github.owner.length > 0 && github.repo.length > 0;
}

export async function runToolTurn(options: ToolTurnOptions): Promise<ToolTurnOutcome> {
  const { workspace, github } = options;

  const execute = async (input: {
    tool: ToolDefinition;
    args: Record<string, unknown>;
  }): Promise<ToolExecution> => {
    const { tool, args } = input;
    switch (tool.name) {
      case "list_files": {
        const folder = typeof args.folder === "string" && args.folder.length > 0 ? args.folder : null;
        const files = workspace
          .files()
          .filter((file) => folder === null || file.path === folder || file.path.startsWith(`${folder}/`))
          .map((file) => file.path);
        return {
          ok: true,
          summary: files.length === 0 ? "The workspace has no file there." : `${files.length} file(s).`,
          data: { files, total: workspace.totals() },
        };
      }
      case "read_file": {
        const file = workspace.read(args.path);
        if (file === null) {
          return { ok: false, summary: `${String(args.path)} is not in the workspace.` };
        }
        return {
          ok: true,
          summary: `Read ${file.path} (${file.content.length} characters).`,
          data: { path: file.path, content: file.content.slice(0, MAX_TOOL_RESULT_CHARS) },
        };
      }
      case "write_file": {
        const file = workspace.write(args.path, args.content);
        return { ok: true, summary: `Wrote ${file.path} (${file.content.length} characters).`, data: { path: file.path } };
      }
      case "delete_file": {
        const removed = workspace.remove(args.path);
        return {
          ok: removed,
          summary: removed ? `Deleted ${String(args.path)}.` : `${String(args.path)} is not in the workspace.`,
        };
      }
      case "search_files": {
        const matches = workspace.search(args.query, args.folder);
        return {
          ok: true,
          summary: matches.length === 0 ? "No match." : `${matches.length} match(es).`,
          data: { matches },
        };
      }
      case "create_scene": {
        const scene = parseScene(args.scene);
        options.onScene(scene);
        return {
          ok: true,
          summary: `Rendered "${scene.title}" with ${scene.nodes.length} node(s).`,
          data: { title: scene.title, nodes: scene.nodes.length, lights: scene.lights.length },
        };
      }
      case "github_commit": {
        if (github.token === null) {
          return { ok: false, summary: "GitHub is not connected." };
        }
        if (!github.allowCommit) {
          return { ok: false, summary: "The profile does not allow the AI to commit." };
        }
        const chosen = Array.isArray(args.files)
          ? (args.files as string[])
          : workspace
              .files()
              .map((file) => file.path)
              .slice(0, MAX_COMMIT_FILES);
        const files = chosen.map((path) => {
          const file = workspace.read(path);
          if (file === null) {
            throw new Error(`${path} is not in the workspace.`);
          }
          return { path: file.path, content: file.content };
        });
        const outcome = await commitFiles({
          token: github.token,
          owner: github.owner,
          repo: github.repo,
          branch: typeof args.branch === "string" && args.branch.length > 0 ? args.branch : github.branch,
          message: String(args.message),
          files,
        });
        return {
          ok: true,
          summary: `Committed ${outcome.files.length} file(s) to ${github.owner}/${github.repo} on ${outcome.branch}.`,
          data: { commitSha: outcome.commitSha, url: outcome.url, files: outcome.files },
        };
      }
      default:
        return { ok: false, summary: `keyrig ran nothing for ${tool.name}.` };
    }
  };

  const outcome = await runAgentTurn({
    messages: options.messages,
    enabled: options.enabled,
    autoApproveWrites: options.autoApproveWrites,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    callModel: options.callModel,
    approve: options.approve,
    execute,
    blockedReason: (tool) =>
      tool.needsGithub && !readyGithub(github)
        ? "GitHub is not connected, or the profile does not allow a commit. Connect GitHub in the profile, then ask again."
        : null,
    onEvent: options.onEvent,
  });

  return { text: outcome.text, events: outcome.events, hitLimit: outcome.hitLimit };
}
