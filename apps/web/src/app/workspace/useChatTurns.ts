import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import {
  GITHUB_TOKEN_NAME,
  parseRepo,
  sendChat,
  type AgentApprovalRequest,
  type KeyView,
  type SignedInAccount,
  type UsageBus,
} from "@keyrig/core";
import type { Catalog, Pricing, ProviderManifest } from "@keyrig/providers";
import type { KeyrigErrorJSON } from "@keyrig/shared";
import { expandContext } from "../../lib/composerTokens";
import { createDeltaBuffer, type DeltaBuffer } from "../../lib/deltaBuffer";
import { trimExchanges } from "../../lib/trimMessages";
import { newId, type ArenaResult, type UIMessage } from "../../lib/types";
import { runToolTurn } from "../../services/agentRun";
import type { AccountConnections } from "../../stores/connections";
import { activeTools, type AgentSettings } from "../../stores/toolSettings";
import type { Workspace, WorkspaceFile } from "../../stores/workspace";
import { safeError, toChatMessages, withOtherKeyAction } from "./chatTurnHelpers";

/** ER-04: the device knows that it is offline. The card stays until the network is back. */
const OFFLINE_ERROR: KeyrigErrorJSON = {
  code: "network_offline",
  category: "network",
  message: "This device is offline. Reconnect, then check the network again.",
  retryable: true,
  remediation: { action: "check_network" },
  details: {},
};

/** ER-04: a short chat has nothing to remove, so offer a larger context instead. */
const NOTHING_TO_TRIM_ERROR: KeyrigErrorJSON = {
  code: "context_overflow",
  category: "context_overflow",
  message: "There is no older exchange to remove. Pick a model with a larger context, or start a new chat.",
  retryable: false,
  remediation: { action: "switch_model" },
  details: {},
};

/** Patch one message without copying the rest of the list. */
function patchMessage(
  setMessages: Dispatch<SetStateAction<UIMessage[]>>,
  id: string,
  patch: (message: UIMessage) => UIMessage,
): void {
  setMessages((current) => current.map((message) => (message.id === id ? patch(message) : message)));
}

/** One delta buffer for an answer, so both turn types stream the same way. */
function createAssistantBuffer(
  assistantId: string,
  setMessages: Dispatch<SetStateAction<UIMessage[]>>,
): DeltaBuffer {
  return createDeltaBuffer(
    (text) => patchMessage(setMessages, assistantId, (message) => ({ ...message, content: message.content + text })),
    (callback) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
      } else {
        setTimeout(callback, 16);
      }
    },
  );
}

/** The repository of the tool context, or empty fields when none is set. */
function githubTarget(connections: AccountConnections | null): { owner: string; repo: string } {
  if (connections === null || connections.githubRepo.length === 0) {
    return { owner: "", repo: "" };
  }
  try {
    const parsed = parseRepo(connections.githubRepo);
    return { owner: parsed.owner, repo: parsed.repo };
  } catch {
    return { owner: "", repo: "" };
  }
}

interface UseChatTurnsOptions {
  session: SignedInAccount | null;
  needsKey: boolean;
  selectedKey: KeyView | undefined;
  /** The keys for this provider. A second key can take over a failed request. */
  keys: KeyView[];
  onKeyChange: (id: string) => void;
  manifest: ProviderManifest;
  modelId: string;
  providerId: string;
  pricing: Pricing | undefined;
  effectiveBaseUrl: string | undefined;
  catalog: Catalog | null;
  bus: UsageBus;
  systemPromptText: string;
  workspace: Workspace | null;
  connections: AccountConnections | null;
  agentSettings: AgentSettings;
  messages: UIMessage[];
  files: WorkspaceFile[];
  toolsReady: boolean;
  setMessages: Dispatch<SetStateAction<UIMessage[]>>;
  setKeys: (keys: KeyView[]) => void;
  setStreaming: (value: boolean) => void;
  setApproval: (request: AgentApprovalRequest | null) => void;
  abortRef: { current: AbortController | null };
  approvalRef: { current: ((decision: "approve" | "deny") => void) | null };
  refreshFiles: () => void;
  onOpenKeys: () => void;
  onOpenRoute: () => void;
}

/**
 * The chat turns of the workspace: one plain answer, one agent turn with tools,
 * the arena run and the error actions. The screen keeps the state.
 */
export function useChatTurns(options: UseChatTurnsOptions) {
  const {
    session,
    needsKey,
    selectedKey,
    keys,
    onKeyChange,
    manifest,
    modelId,
    providerId,
    pricing,
    effectiveBaseUrl,
    catalog,
    bus,
    systemPromptText,
    workspace,
    connections,
    agentSettings,
    messages,
    files,
    toolsReady,
    setMessages,
    setKeys,
    setStreaming,
    setApproval,
    abortRef,
    approvalRef,
    refreshFiles,
    onOpenKeys,
    onOpenRoute,
  } = options;

  /** The keys that already failed one answer. A new key follows the failed one. */
  const triedKeys = useRef(new Map<string, Set<string>>());

  const runAssistant = useCallback(
    async (assistantId: string, history: UIMessage[], keyOverride?: KeyView): Promise<void> => {
      const key = keyOverride ?? selectedKey;
      if (!session || (needsKey && !key)) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      // PV-08: join the deltas and render once for each frame.
      const buffer = createAssistantBuffer(assistantId, setMessages);
      try {
        const outcome = await sendChat({
          vault: session.vault,
          ...(key ? { keyId: key.id } : {}),
          manifest,
          model: modelId.trim(),
          messages: toChatMessages(history),
          systemPrompt: systemPromptText,
          ...(pricing !== undefined ? { pricing } : {}),
          ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
          bus,
          signal: controller.signal,
          handlers: {
            onDelta: (text) => buffer.push(text),
          },
        });
        // The full text replaces the streamed text, so a late flush must not run.
        buffer.clear();
        triedKeys.current.delete(assistantId);
        patchMessage(setMessages, assistantId, (message) => ({
          ...message,
          content: outcome.result.text,
          model: modelId,
          providerId,
          keyLabel: outcome.key?.label ?? "No key",
          costUsd: outcome.cost.usd,
          pricingKnown: outcome.cost.pricingKnown,
          inputTokens: outcome.result.usage.inputTokens,
          outputTokens: outcome.result.usage.outputTokens,
          ...(outcome.result.usage.cachedTokens !== undefined
            ? { cachedTokens: outcome.result.usage.cachedTokens }
            : {}),
          cacheState: outcome.cacheState,
          stopReason: outcome.result.stopReason,
        }));
      } catch (caught) {
        // Keep the text that arrived before the failure (PV-08).
        buffer.flush();
        const tried = triedKeys.current.get(assistantId) ?? new Set<string>();
        if (key !== undefined) {
          tried.add(key.id);
          triedKeys.current.set(assistantId, tried);
        }
        const otherKey = keys.some((item) => !tried.has(item.id));
        const error = withOtherKeyAction(safeError(caught), otherKey);
        patchMessage(setMessages, assistantId, (message) => ({ ...message, error }));
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // KS-05: the vault writes the last-used date. Read it back for the key card.
        setKeys(session.vault.listKeys());
      }
    },
    [
      session,
      needsKey,
      selectedKey,
      keys,
      manifest,
      modelId,
      providerId,
      pricing,
      effectiveBaseUrl,
      bus,
      systemPromptText,
      setMessages,
      setKeys,
      setStreaming,
      abortRef,
    ],
  );

  /** AS-01: a turn that can call a tool. The loop lives in the core. */
  const runToolAssistant = useCallback(
    async (assistantId: string, history: UIMessage[]): Promise<void> => {
      if (!session || workspace === null || (needsKey && !selectedKey)) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      const buffer = createAssistantBuffer(assistantId, setMessages);

      let spent = 0;
      let pricingKnown = true;
      let inputTokens = 0;
      let outputTokens = 0;
      let keyLabel = selectedKey?.label ?? "No key";
      const { owner, repo } = githubTarget(connections);

      try {
        const result = await runToolTurn({
          messages: toChatMessages(history),
          enabled: activeTools(agentSettings),
          autoApproveWrites: agentSettings.autoApproveWrites,
          signal: controller.signal,
          workspace,
          callModel: async (outgoing, tools) => {
            const outcome = await sendChat({
              vault: session.vault,
              ...(selectedKey ? { keyId: selectedKey.id } : {}),
              manifest,
              model: modelId.trim(),
              messages: outgoing,
              systemPrompt: systemPromptText,
              ...(tools.length > 0 ? { tools } : {}),
              ...(pricing !== undefined ? { pricing } : {}),
              ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
              bus,
              signal: controller.signal,
              toolRan: true,
              handlers: { onDelta: (text) => buffer.push(text) },
            });
            buffer.flush();
            spent += outcome.cost.usd;
            pricingKnown = pricingKnown && outcome.cost.pricingKnown;
            inputTokens += outcome.result.usage.inputTokens;
            outputTokens += outcome.result.usage.outputTokens;
            keyLabel = outcome.key?.label ?? "No key";
            return { text: outcome.result.text, toolCalls: outcome.result.toolCalls ?? [] };
          },
          approve: (request) =>
            new Promise<"approve" | "deny">((resolve) => {
              approvalRef.current = resolve;
              setApproval(request);
            }),
          github: {
            token: session.vault.readInternalSecret(GITHUB_TOKEN_NAME),
            owner,
            repo,
            branch: connections?.githubBranch ?? "main",
            allowCommit: connections?.commitPermit === true,
          },
          onScene: (next) => patchMessage(setMessages, assistantId, (message) => ({ ...message, scene: next })),
          onEvent: (event) => {
            patchMessage(setMessages, assistantId, (message) => {
              const tools = message.tools ?? [];
              const index = tools.findIndex((item) => item.id === event.id);
              const nextTools =
                index === -1 ? [...tools, event] : tools.map((item, at) => (at === index ? event : item));
              return { ...message, tools: nextTools };
            });
            refreshFiles();
          },
        });

        buffer.clear();
        patchMessage(setMessages, assistantId, (message) => ({
          ...message,
          content: result.text,
          model: modelId,
          providerId,
          keyLabel,
          costUsd: spent,
          pricingKnown,
          inputTokens,
          outputTokens,
          stopReason: result.hitLimit ? "limit" : "complete",
        }));
      } catch (caught) {
        buffer.flush();
        const error = safeError(caught);
        patchMessage(setMessages, assistantId, (message) => ({ ...message, error }));
      } finally {
        setStreaming(false);
        abortRef.current = null;
        approvalRef.current?.("deny");
        approvalRef.current = null;
        setApproval(null);
        setKeys(session.vault.listKeys());
        refreshFiles();
      }
    },
    [
      session,
      workspace,
      needsKey,
      selectedKey,
      connections,
      agentSettings,
      manifest,
      modelId,
      pricing,
      effectiveBaseUrl,
      bus,
      providerId,
      systemPromptText,
      refreshFiles,
      setMessages,
      setKeys,
      setStreaming,
      setApproval,
      abortRef,
      approvalRef,
    ],
  );

  /** AS-01: answer one approval card. */
  const decideApproval = useCallback(
    (decision: "approve" | "deny"): void => {
      approvalRef.current?.(decision);
      approvalRef.current = null;
      setApproval(null);
    },
    [approvalRef, setApproval],
  );

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return;
      }
      // CX-04: `@file` becomes a context block for the model, not for the box.
      const outgoing = expandContext(trimmed, files);
      const at = new Date().toISOString();
      const user: UIMessage = {
        id: newId(),
        role: "user",
        content: outgoing,
        ...(outgoing !== trimmed ? { display: trimmed } : {}),
        at,
      };
      const assistant: UIMessage = {
        id: newId(),
        role: "assistant",
        content: "",
        at,
        model: modelId,
        providerId,
        ...(selectedKey ? { keyLabel: selectedKey.label } : {}),
      };
      setMessages((current) => [...current, user, assistant]);
      if (toolsReady) {
        void runToolAssistant(assistant.id, [...messages, user]);
      } else {
        void runAssistant(assistant.id, [...messages, user]);
      }
    },
    [files, messages, modelId, providerId, selectedKey, runAssistant, runToolAssistant, toolsReady, setMessages],
  );

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    approvalRef.current?.("deny");
    approvalRef.current = null;
    setApproval(null);
  }, [abortRef, approvalRef, setApproval]);

  /** Clear one failed answer and send it again with the history it must use. */
  const retryWith = useCallback(
    (message: UIMessage, history: UIMessage[], base: readonly UIMessage[], keyOverride?: KeyView): void => {
      setMessages(
        base.map((item) => {
          if (item.id !== message.id) {
            return item;
          }
          const { error: _removed, ...rest } = item;
          return { ...rest, content: "" };
        }),
      );
      void runAssistant(message.id, history, keyOverride);
    },
    [runAssistant, setMessages],
  );

  const onErrorAction = useCallback(
    (action: string, message: UIMessage): void => {
      if (action === "retry" || action === "check_network") {
        if (action === "check_network" && navigator.onLine === false) {
          setMessages((current) =>
            current.map((item) => (item.id === message.id ? { ...item, error: OFFLINE_ERROR } : item)),
          );
          return;
        }
        const index = messages.findIndex((item) => item.id === message.id);
        retryWith(message, index === -1 ? messages : messages.slice(0, index), messages);
        return;
      }
      if (action === "reduce_context") {
        const trimmed = trimExchanges(messages);
        if (trimmed.length === messages.length) {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, error: NOTHING_TO_TRIM_ERROR } : item,
            ),
          );
          return;
        }
        const removed = messages.length - trimmed.length;
        const confirmed = window.confirm(
          `Remove the ${removed} oldest message${removed === 1 ? "" : "s"} from this chat and try again?`,
        );
        if (!confirmed) {
          return;
        }
        const index = trimmed.findIndex((item) => item.id === message.id);
        if (index === -1) {
          // The failed turn is older than the kept exchanges, so the trim removes it.
          setMessages(trimmed);
          return;
        }
        retryWith(message, trimmed.slice(0, index), trimmed);
        return;
      }
      if (action === "change_prompt") {
        const index = messages.findIndex((item) => item.id === message.id);
        if (index === -1) {
          return;
        }
        const previous = messages
          .slice(0, index)
          .reverse()
          .find((item) => item.role === "user");
        setMessages((current) =>
          current.filter((item) => item.id !== message.id && item.id !== previous?.id),
        );
        return;
      }
      if (action === "use_other_key") {
        // Every key of the run so far is spent. The next key is the one left.
        const tried = triedKeys.current.get(message.id) ?? new Set<string>();
        const other =
          keys.find((item) => !tried.has(item.id) && item.id !== selectedKey?.id) ??
          keys.find((item) => !tried.has(item.id));
        if (other === undefined) {
          onOpenKeys();
          return;
        }
        onKeyChange(other.id);
        const index = messages.findIndex((item) => item.id === message.id);
        retryWith(message, index === -1 ? messages : messages.slice(0, index), messages, other);
        return;
      }
      if (action === "check_key" || action === "check_settings") {
        onOpenKeys();
        return;
      }
      if (action === "switch_model") {
        onOpenRoute();
        return;
      }
      if (action === "dismiss") {
        setMessages((current) => current.filter((item) => item.id !== message.id));
      }
    },
    [messages, keys, selectedKey, onKeyChange, onOpenKeys, onOpenRoute, retryWith, setMessages],
  );

  const runArena = useCallback(
    async (prompt: string, chosen: string[]): Promise<ArenaResult[]> => {
      if (!session || (needsKey && !selectedKey)) {
        return [];
      }
      return Promise.all(
        chosen.map(async (model) => {
          const started = performance.now();
          try {
            const outcome = await sendChat({
              vault: session.vault,
              ...(selectedKey ? { keyId: selectedKey.id } : {}),
              manifest,
              model,
              messages: [{ role: "user", content: prompt }],
              systemPrompt: systemPromptText,
              ...(catalog?.providers[providerId]?.models[model]?.pricing
                ? { pricing: catalog.providers[providerId]?.models[model]?.pricing }
                : {}),
              ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
              bus,
            });
            return {
              model,
              text: outcome.result.text,
              durationMs: performance.now() - started,
              costUsd: outcome.cost.usd,
              pricingKnown: outcome.cost.pricingKnown,
              inputTokens: outcome.result.usage.inputTokens,
              outputTokens: outcome.result.usage.outputTokens,
            };
          } catch (caught) {
            return {
              model,
              text: "",
              durationMs: performance.now() - started,
              costUsd: 0,
              pricingKnown: false,
              inputTokens: 0,
              outputTokens: 0,
              error: safeError(caught),
            };
          }
        }),
      );
    },
    [
      session,
      needsKey,
      selectedKey,
      manifest,
      systemPromptText,
      catalog,
      providerId,
      effectiveBaseUrl,
      bus,
    ],
  );

  return { send, stop, decideApproval, onErrorAction, runArena };
}
