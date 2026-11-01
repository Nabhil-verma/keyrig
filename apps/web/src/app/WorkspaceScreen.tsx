import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountRecord, AgentApprovalRequest, KeyView, RoleAssignment, RoleId, SignedInAccount } from "@keyrig/core";
import {
  GITHUB_TOKEN_NAME,
  ROLE_LABELS,
  accountStorage,
  assignRole,
  budgetMessage,
  budgetState,
  buildSystemPrompt,
  can,
  createUsageBus,
  ensureAccountRole,
  importVault,
  listAccounts,
  loadProviderModels,
  parseRepo,
  readAssignments,
  sendChat,
  signIn,
  signUp,
} from "@keyrig/core";
import {
  BUILTIN_MANIFESTS,
  checkBaseUrl,
  findModel,
  formatUsd,
  getManifest,
  loadCatalog,
  modelsForProvider,
  type Catalog,
  type CatalogSource,
  type ChatMessage,
  type ProviderManifest,
} from "@keyrig/providers";
import { isKeyrigError, toKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import { ArenaPanel } from "../components/ArenaPanel";
import { AuthPanel } from "../components/AuthPanel";
import { ChatPanel } from "../components/ChatPanel";
import { ConnectionsPanel } from "../components/ConnectionsPanel";
import { KeyPanel } from "../components/KeyPanel";
import { OutboundPanel } from "../components/OutboundPanel";
import { ProfilePanel } from "../components/ProfilePanel";
import { RolesPanel } from "../components/RolesPanel";
import { Shelf, type ShelfTab } from "../components/Shelf";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { ToolTrace } from "../components/ToolTrace";
import { WorkspacePanel } from "../components/WorkspacePanel";
import { runToolTurn } from "../services/agentRun";
import { expandContext } from "../lib/composerTokens";
import { readConnections, type AccountConnections } from "../stores/connections";
import { createDeltaBuffer, type DeltaBuffer } from "../lib/deltaBuffer";
import { Link } from "./router";
import { readRoute, writeRoute } from "../stores/routeStore";
import { useSettings, writeSettings } from "../stores/settings";
import { addSpend, readSpend, utcDay } from "../stores/spendStore";
import { browserStorage } from "../lib/storage";
import {
  createThread,
  readThreads,
  removeThread as removeThreadFromList,
  threadPreview,
  titleFrom,
  upsertThread,
  writeThreads,
  type StoredThread,
} from "../stores/threads";
import { activeTools, useAgentSettings } from "../stores/toolSettings";
import { newId, type ArenaResult, type UIMessage } from "../lib/types";
import { BrandLockup } from "../ui/BrandLockup";
import { Icon } from "../ui/Icon";
import { Workspace, type WorkspaceFile } from "../stores/workspace";

const storage = browserStorage();
const INSPECT_TABS: ReadonlyArray<{ id: InspectTab; label: string }> = [
  { id: "outbound", label: "Outbound" },
  { id: "files", label: "Files" },
  { id: "tools", label: "Tools" },
];

type InspectTab = "outbound" | "files" | "tools";

function safeError(caught: unknown): KeyrigErrorJSON {
  return isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
}

function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.error === undefined && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
}

export default function App() {
  const settings = useSettings();
  /** A disabled provider pack leaves the key and route pickers. */
  const enabledManifests = useMemo(() => {
    const enabled = BUILTIN_MANIFESTS.filter((item) => !settings.disabledProviders.includes(item.id));
    return enabled.length > 0 ? enabled : BUILTIN_MANIFESTS;
  }, [settings.disabledProviders]);

  const [session, setSession] = useState<SignedInAccount | null>(null);
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("openai");
  const [modelId, setModelId] = useState("gpt-5.4");
  const [keyId, setKeyId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [view, setView] = useState<"chat" | "arena">("chat");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  /** CO-02: the spend for the UTC day, kept on this device. */
  const [spentToday, setSpentToday] = useState(0);
  /** A user choice to pass the daily limit for this session only. */
  const [overBudget, setOverBudget] = useState(false);
  const [role, setRole] = useState<RoleId | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsNonce, setModelsNonce] = useState(0);
  /** AS-01: the agent settings of this device. */
  const agentSettings = useAgentSettings();
  const [connections, setConnections] = useState<AccountConnections | null>(null);
  const [approval, setApproval] = useState<AgentApprovalRequest | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const [shelf, setShelf] = useState<{ open: boolean; tab: ShelfTab }>({ open: false, tab: "keys" });
  const [routeOpen, setRouteOpen] = useState(false);
  const [inspect, setInspect] = useState<InspectTab>("outbound");

  const bus = useMemo(() => createUsageBus(), []);
  const abortRef = useRef<AbortController | null>(null);
  const approvalRef = useRef<((decision: "approve" | "deny") => void) | null>(null);
  const threadsRef = useRef<StoredThread[]>([]);
  /** AS-05: one workspace for the signed-in account. */
  const workspace = useMemo(
    () => (session === null ? null : new Workspace({ storage: accountStorage(storage, session.username) })),
    [session],
  );
  const refreshFiles = useCallback(() => {
    setFiles(workspace === null ? [] : workspace.files());
  }, [workspace]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    let active = true;
    void loadCatalog({ storage }).then((result) => {
      if (!active) {
        return;
      }
      setCatalog(result.catalog);
      setCatalogSource(result.source);
      setCatalogWarning(result.warning ?? null);
    });
    // CO-02: the day opens from the stored total, so a reload keeps the budget.
    setSpentToday(readSpend(storage, utcDay()));
    const unsubscribe = bus.subscribe((event) => {
      setTotalCost((value) => value + event.costUsd);
      setSpentToday(addSpend(storage, event.costUsd));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bus]);

  const manifest = (getManifest(enabledManifests, providerId) ?? enabledManifests[0]) as ProviderManifest;
  /** The hosted model needs no key, because keyrig pays. Every other provider does. */
  const needsKey = manifest.authType !== "none";
  const models = useMemo(() => (catalog ? modelsForProvider(catalog, providerId) : []), [catalog, providerId]);
  const catalogModel = useMemo(
    () => (catalog ? findModel(catalog, providerId, modelId) : undefined),
    [catalog, providerId, modelId],
  );
  const pricing = catalogModel?.pricing;
  /** AS-06: one guard prompt for every request of this session. */
  const systemPromptText = useMemo(
    () => buildSystemPrompt({ instructions: settings.instructions, tools: true }),
    [settings.instructions],
  );
  /** AS-01: a tool call needs a model that takes tools and a user who turned the agent on. */
  const activeToolNames = activeTools(agentSettings);
  const toolsReady =
    activeToolNames.length > 0 && manifest.abilities.tools && manifest.wireFormat === "openai-chat";
  /** CO-02: the day budget, the warning and the stop. */
  const budget = budgetState(spentToday, settings.dailyBudgetUsd);
  const budgetStop = budget.level === "blocked" && !overBudget;
  const providerKeys = keys.filter((key) => key.providerId === providerId);
  const selectedKey = keys.find((key) => key.id === keyId);
  const activeThread = threads.find((thread) => thread.id === activeId);
  const theme = settings.theme === "light" ? "light" : "dark";

  const filteredThreads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return threads;
    }
    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(needle) || threadPreview(thread).toLowerCase().includes(needle),
    );
  }, [threads, search]);

  const lastTools = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message !== undefined && message.role === "assistant" && message.tools !== undefined) {
        return message.tools;
      }
    }
    return [];
  }, [messages]);

  const contextUsed = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message !== undefined && message.role === "assistant" && message.inputTokens !== undefined) {
        return message.inputTokens + (message.outputTokens ?? 0);
      }
    }
    return 0;
  }, [messages]);

  useEffect(() => {
    const available = keys.filter((key) => key.providerId === providerId);
    if (!available.some((key) => key.id === keyId)) {
      setKeyId(available[0]?.id ?? "");
    }
  }, [keys, providerId, keyId]);

  /** A plugin can be disabled while its provider is selected. Move to the first pack. */
  useEffect(() => {
    if (enabledManifests.some((item) => item.id === providerId)) {
      return;
    }
    const first = enabledManifests[0];
    if (first === undefined) {
      return;
    }
    setProviderId(first.id);
    setModelId(first.defaultModel ?? "");
    setBaseUrl(first.supportsCustomBaseUrl ? first.baseUrl : "");
    setProviderModels([]);
    setModelsError(null);
  }, [enabledManifests, providerId]);

  const baseUrlCheck =
    manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? checkBaseUrl(baseUrl.trim()) : null;
  const customBaseBlocked = baseUrlCheck !== null && !baseUrlCheck.allowed;
  const effectiveBaseUrl = manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : undefined;

  /**
   * PV-11: read the model list when the manifest allows one. The picker shows
   * the list after this request. A provider that does not list its models
   * keeps the typed model name.
   */
  useEffect(() => {
    if (session === null || !can(role, "route.manage") || !manifest.abilities.modelList) {
      setProviderModels([]);
      setModelsBusy(false);
      setModelsError(null);
      return;
    }
    if (manifest.authType === "api-key" && providerKeys.length === 0) {
      setProviderModels([]);
      setModelsBusy(false);
      setModelsError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setProviderModels([]);
    setModelsBusy(true);
    setModelsError(null);

    // Wait for a short pause. Each keystroke in the base URL must not start a request.
    const timer = setTimeout(() => {
      void loadProviderModels({
        vault: session.vault,
        manifest,
        ...(keyId.length > 0 ? { keyId } : {}),
        ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
        signal: controller.signal,
      })
        .then((result) => {
          if (!active) {
            return;
          }
          setProviderModels(result.models);
          setModelsError(result.models.length === 0 ? "The provider sent no model names. Type the model name." : null);
        })
        .catch((caught: unknown) => {
          if (!active) {
            return;
          }
          setProviderModels([]);
          setModelsError(safeError(caught).message);
        })
        .finally(() => {
          if (active) {
            setModelsBusy(false);
          }
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, manifest, keyId, effectiveBaseUrl, providerKeys.length, role, modelsNonce]);

  /** The chat record follows the messages of the open thread. */
  useEffect(() => {
    if (session === null || activeId.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const current = threadsRef.current.find((thread) => thread.id === activeId);
      const firstUser = messages.find((message) => message.role === "user");
      const title =
        current !== undefined && current.title !== "New chat"
          ? current.title
          : firstUser !== undefined
            ? titleFrom(firstUser.display ?? firstUser.content)
            : "New chat";
      const now = new Date().toISOString();
      const next = upsertThread(threadsRef.current, {
        id: activeId,
        title,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        messages,
      });
      writeThreads(accountStorage(storage, session.username), next);
      setThreads(next);
    }, 400);
    return () => clearTimeout(timer);
  }, [messages, activeId, session]);

  /** Keep the route for this account. The write is best effort. */
  useEffect(() => {
    if (session === null || !settings.rememberRoute) {
      return;
    }
    writeRoute(storage, session.username, { providerId, modelId, keyId, baseUrl });
  }, [session, providerId, modelId, keyId, baseUrl, settings.rememberRoute]);

  const blockReason = !session
    ? "Sign in to start."
    : !can(role, "chat.send")
      ? "Your role cannot send prompts. Ask an owner to change your role."
      : budgetStop
        ? (budgetMessage(budget) ?? "The daily budget is spent.")
        : needsKey && providerKeys.length === 0
          ? `Add a key for ${manifest.displayName}.`
          : modelId.trim().length === 0
            ? "Choose a model."
            : customBaseBlocked
              ? (baseUrlCheck?.warning ?? "The base URL is not allowed.")
              : (baseUrlCheck?.warning ?? null);

  const canSend =
    session !== null &&
    can(role, "chat.send") &&
    !budgetStop &&
    (!needsKey || (providerKeys.length > 0 && keyId.length > 0)) &&
    modelId.trim().length > 0 &&
    !customBaseBlocked &&
    !streaming;

  const runAssistant = useCallback(
    async (assistantId: string, history: UIMessage[]): Promise<void> => {
      if (!session || (needsKey && !selectedKey)) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      // PV-08: join the deltas and render once for each frame.
      const buffer: DeltaBuffer = createDeltaBuffer(
        (text) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + text } : message,
            ),
          );
        },
        (callback) => {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(callback);
          } else {
            setTimeout(callback, 16);
          }
        },
      );
      try {
        const outcome = await sendChat({
          vault: session.vault,
          ...(selectedKey ? { keyId: selectedKey.id } : {}),
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
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
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
                }
              : message,
          ),
        );
      } catch (caught) {
        // Keep the text that arrived before the failure (PV-08).
        buffer.flush();
        const error = safeError(caught);
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, error } : message)),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
        // KS-05: the vault writes the last-used date. Read it back for the key card.
        setKeys(session.vault.listKeys());
      }
    },
    [session, selectedKey, manifest, modelId, pricing, effectiveBaseUrl, bus, providerId, systemPromptText],
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
      const buffer: DeltaBuffer = createDeltaBuffer(
        (text) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + text } : message,
            ),
          );
        },
        (callback) => {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(callback);
          } else {
            setTimeout(callback, 16);
          }
        },
      );

      let spent = 0;
      let pricingKnown = true;
      let inputTokens = 0;
      let outputTokens = 0;
      let keyLabel = selectedKey?.label ?? "No key";
      let owner = "";
      let repo = "";
      if (connections !== null && connections.githubRepo.length > 0) {
        try {
          const parsed = parseRepo(connections.githubRepo);
          owner = parsed.owner;
          repo = parsed.repo;
        } catch {
          owner = "";
          repo = "";
        }
      }

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
          onScene: (next) =>
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, scene: next } : message)),
            ),
          onEvent: (event) => {
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantId) {
                  return message;
                }
                const tools = message.tools ?? [];
                const index = tools.findIndex((item) => item.id === event.id);
                const nextTools =
                  index === -1 ? [...tools, event] : tools.map((item, at) => (at === index ? event : item));
                return { ...message, tools: nextTools };
              }),
            );
            refreshFiles();
          },
        });

        buffer.clear();
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
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
                }
              : message,
          ),
        );
      } catch (caught) {
        buffer.flush();
        const error = safeError(caught);
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, error } : message)),
        );
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
    ],
  );

  /** AS-01: answer one approval card. */
  const decideApproval = (decision: "approve" | "deny"): void => {
    approvalRef.current?.(decision);
    approvalRef.current = null;
    setApproval(null);
  };

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
    [files, messages, modelId, providerId, selectedKey, runAssistant, runToolAssistant, toolsReady],
  );

  const stop = (): void => {
    abortRef.current?.abort();
    approvalRef.current?.("deny");
    approvalRef.current = null;
    setApproval(null);
  };

  const onErrorAction = (action: string, message: UIMessage): void => {
    if (action === "retry") {
      const index = messages.findIndex((item) => item.id === message.id);
      const history = index === -1 ? messages : messages.slice(0, index);
      setMessages((current) =>
        current.map((item) => {
          if (item.id !== message.id) {
            return item;
          }
          const { error: _removed, ...rest } = item;
          return { ...rest, content: "" };
        }),
      );
      void runAssistant(message.id, history);
      return;
    }
    if (action === "check_key" || action === "check_settings") {
      setShelf({ open: true, tab: "keys" });
      return;
    }
    if (action === "switch_model") {
      setRouteOpen(true);
      return;
    }
    if (action === "dismiss") {
      setMessages((current) => current.filter((item) => item.id !== message.id));
    }
  };

  const runArena = async (prompt: string, chosen: string[]): Promise<ArenaResult[]> => {
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
  };

  const pickArenaAnswer = (prompt: string, result: ArenaResult): void => {
    const at = new Date().toISOString();
    setMessages([
      { id: newId(), role: "user", content: prompt, at },
      {
        id: newId(),
        role: "assistant",
        content: result.text,
        at,
        model: result.model,
        providerId,
        ...(selectedKey ? { keyLabel: selectedKey.label } : {}),
        costUsd: result.costUsd,
        pricingKnown: result.pricingKnown,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        stopReason: "complete",
      },
    ]);
    setModelId(result.model);
    setView("chat");
  };

  const changeProvider = (next: string): void => {
    const nextManifest = getManifest(enabledManifests, next);
    setProviderId(next);
    setModelId(nextManifest?.defaultModel ?? "");
    setBaseUrl(nextManifest?.supportsCustomBaseUrl ? nextManifest.baseUrl : "");
    setProviderModels([]);
    setModelsError(null);
  };

  /** PV-11: read the model list again with the selected key. */
  const reloadModels = (): void => {
    setModelsNonce((value) => value + 1);
  };

  const persistThreads = (next: StoredThread[]): void => {
    setThreads(next);
    threadsRef.current = next;
    if (session !== null) {
      writeThreads(accountStorage(storage, session.username), next);
    }
  };

  const openThread = (thread: StoredThread): void => {
    abortRef.current?.abort();
    approvalRef.current?.("deny");
    approvalRef.current = null;
    setApproval(null);
    setActiveId(thread.id);
    setMessages(thread.messages);
    setView("chat");
  };

  const newChat = (): void => {
    abortRef.current?.abort();
    const current = threadsRef.current.find((thread) => thread.id === activeId);
    if (current !== undefined && current.messages.length === 0) {
      setMessages([]);
      setView("chat");
      return;
    }
    const thread = createThread();
    persistThreads(upsertThread(threadsRef.current, thread));
    setActiveId(thread.id);
    setMessages([]);
    setView("chat");
  };

  const deleteThread = (id: string): void => {
    if (streaming) {
      return;
    }
    const next = removeThreadFromList(threadsRef.current, id);
    persistThreads(next);
    if (id !== activeId) {
      return;
    }
    const fallback = next[0];
    if (fallback === undefined) {
      const fresh = createThread();
      persistThreads(upsertThread(next, fresh));
      setActiveId(fresh.id);
      setMessages([]);
      return;
    }
    setActiveId(fallback.id);
    setMessages(fallback.messages);
  };

  const enterSession = (account: SignedInAccount): void => {
    const deviceKeys = account.vault.listKeys();
    const saved = readRoute(storage, account.username);
    const savedManifest = saved ? getManifest(enabledManifests, saved.providerId) : undefined;
    const savedKey = saved ? deviceKeys.find((key) => key.id === saved.keyId) : undefined;
    const firstManifest = enabledManifests[0];

    const accountStore = accountStorage(storage, account.username);
    const savedThreads = readThreads(accountStore);
    const firstThread = savedThreads[0] ?? createThread();
    const threadList = savedThreads.length > 0 ? savedThreads : [firstThread];
    if (savedThreads.length === 0) {
      writeThreads(accountStore, threadList);
    }

    setSession(account);
    setKeys(deviceKeys);
    setRole(ensureAccountRole({ storage }, account.username));
    setAccounts(listAccounts(storage));
    setAssignments(readAssignments({ storage }));
    setRoleError(null);
    setThreads(threadList);
    threadsRef.current = threadList;
    setActiveId(firstThread.id);
    setMessages(firstThread.messages);
    setTotalCost(0);
    setOverBudget(false);
    setSpentToday(readSpend(storage, utcDay()));
    setView("chat");
    setProviderModels([]);
    setModelsError(null);
    setConnections(readConnections(accountStore));
    setApproval(null);
    setFiles(new Workspace({ storage: accountStore }).files());

    // A new chat opens with the route that the account used last.
    if (saved !== null && savedManifest !== undefined && savedKey !== undefined) {
      setProviderId(savedManifest.id);
      setModelId(saved.modelId);
      setKeyId(savedKey.id);
      setBaseUrl(savedManifest.supportsCustomBaseUrl ? saved.baseUrl : "");
      return;
    }

    setProviderId(firstManifest?.id ?? "openai");
    setModelId(firstManifest?.defaultModel ?? "");
    setKeyId(deviceKeys.find((key) => key.providerId === firstManifest?.id)?.id ?? "");
    setBaseUrl(firstManifest?.supportsCustomBaseUrl ? firstManifest.baseUrl : "");
  };

  const handleSignUp = async (username: string, password: string): Promise<void> => {
    enterSession(await signUp({ storage, username, password }));
  };

  const handleSignIn = async (username: string, password: string): Promise<void> => {
    enterSession(await signIn({ storage, username, password }));
  };

  const handleImport = async (password: string, file: unknown): Promise<void> => {
    enterSession(await importVault({ storage, password, file }));
  };

  const refreshKeys = (): void => {
    setKeys(session ? session.vault.listKeys() : []);
  };

  /** Sign-out locks the vault, drops the decrypted keys from memory and stops any stream. */
  const signOut = (): void => {
    abortRef.current?.abort();
    session?.vault.lock();
    setSession(null);
    setKeys([]);
    setProviderModels([]);
    setModelsError(null);
    setRole(null);
    setAccounts([]);
    setAssignments([]);
    setRoleError(null);
    setShelf({ open: false, tab: "keys" });
    setMessages([]);
    setThreads([]);
    setActiveId("");
    threadsRef.current = [];
    setTotalCost(0);
    setOverBudget(false);
    setKeyId("");
    setConnections(null);
    setApproval(null);
    setFiles([]);
    setShelf({ open: false, tab: "keys" });
    setRouteOpen(false);
  };

  /** AC-04: only an account with the roles.assign key changes a role. */
  const changeRole = (target: string, next: RoleId): void => {
    if (!session) {
      return;
    }
    try {
      setAssignments(assignRole({ storage, actor: session.username, target, role: next }));
      setRoleError(null);
    } catch (caught) {
      setRoleError(safeError(caught).message);
    }
  };

  if (session === null) {
    return (
      <div className="app">
        <SiteHeader
          actions={
            <span className="status-chip" data-state="locked">
              <span className="status-dot" />
              <span>Signed out</span>
            </span>
          }
        />

        <main className="auth-stage">
          <div className="auth-intro">
            <span className="hero-badge">
              <Icon name="shield" size={12} />
              Keys stay in this browser. They go only to your provider.
            </span>
            <h1>
              One key. <span className="accent">Every model.</span>
            </h1>
            <p>
              keyrig is a BYOK harness. Create an account on this device, add your provider keys once, and route
              each prompt to the model that fits. Every answer shows its model, its key label and its estimated
              cost.
            </p>
          </div>
          <AuthPanel onSignUp={handleSignUp} onSignIn={handleSignIn} onImport={handleImport} />
        </main>

        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="ws">
      <header className="ws-top">
        <span className="ws-brand">
          <BrandLockup height={24} />
        </span>

        <div className="ws-top-tabs" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={view === "chat"}
            className="ws-top-tab"
            onClick={() => setView("chat")}
          >
            <Icon name="chat" size={13} />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "arena"}
            className="ws-top-tab"
            onClick={() => setView("arena")}
          >
            <Icon name="arena" size={13} />
            Arena
          </button>
        </div>

        <div className="ws-top-actions">
          <span className="status-chip" data-state="unlocked">
            <span className="status-dot" />
            {session.username}
          </span>
          <span className="chip mono" title="The cost of this session">
            {formatUsd(totalCost)}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
            onClick={() => writeSettings({ theme: theme === "dark" ? "light" : "dark" })}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-label={`Sign out of ${session.username}`}
            onClick={signOut}
          >
            <Icon name="lock" size={12} />
            Sign out
          </button>
        </div>
      </header>

      <div className="ws-body">
        <aside className="ws-rail">
          <button type="button" className="btn btn--primary btn--sm ws-new" onClick={newChat}>
            <Icon name="plus" size={13} />
            New chat
          </button>

          <label className="ws-search">
            <Icon name="search" size={13} />
            <input
              value={search}
              placeholder="Search chats"
              aria-label="Search chats"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <ol className="ws-threads">
            {filteredThreads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className="ws-thread"
                  aria-current={thread.id === activeId}
                  onClick={() => openThread(thread)}
                >
                  <span className="ws-thread-title">{thread.title}</span>
                  <span className="ws-thread-preview">{threadPreview(thread) || "No message yet"}</span>
                  <span className="ws-thread-meta">
                    {thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}
                  </span>
                </button>
                <button
                  type="button"
                  className="ws-thread-del"
                  aria-label={`Delete ${thread.title}`}
                  onClick={() => deleteThread(thread.id)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </li>
            ))}
          </ol>

          <div className="ws-budget">
            <div className="ws-budget-row">
              <span>{budget.limitUsd === null ? "Today" : "Budget"}</span>
              <strong className="mono">
                {budget.limitUsd === null
                  ? formatUsd(budget.spentUsd)
                  : `${formatUsd(budget.spentUsd)} / ${formatUsd(budget.limitUsd)}`}
              </strong>
            </div>
            <div className="ws-budget-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.round(budget.ratio * 100))}%` }} />
            </div>
            {budgetStop ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOverBudget(true)}>
                Continue this session
              </button>
            ) : null}
          </div>

          <footer className="ws-rail-foot">
            <span className="ws-status">
              <span className="ws-dot" />
              {session.username}
              {role ? ` · ${ROLE_LABELS[role]}` : ""}
            </span>
            <span className="ws-status">No keyrig server · Telemetry off</span>
            <div className="ws-rail-buttons">
              <button type="button" onClick={() => setShelf({ open: true, tab: "keys" })}>
                Keys
              </button>
              <button type="button" onClick={() => setShelf({ open: true, tab: "profile" })}>
                Profile
              </button>
              {role !== null && can(role, "roles.assign") ? (
                <button type="button" onClick={() => setShelf({ open: true, tab: "roles" })}>
                  Roles
                </button>
              ) : null}
              <Link to="/settings">Settings</Link>
            </div>
          </footer>
        </aside>

        <main className="ws-main">
          <div className="ws-head">
            <div className="ws-head-title">
              <span className="eyebrow">{view === "chat" ? "Thread" : "Comparison"}</span>
              <h1>{view === "chat" ? (activeThread?.title ?? "New chat") : "Model arena"}</h1>
            </div>
            <div className="ws-head-actions">
              <span className={`chip ${toolsReady ? "chip--cyan" : "chip--plain"}`}>
                <Icon name="bolt" size={10} />
                {toolsReady ? `${activeToolNames.length} tools` : "tools off"}
              </span>
              <button
                type="button"
                className="ws-route"
                aria-expanded={routeOpen}
                aria-label="Provider and model"
                onClick={() => setRouteOpen((value) => !value)}
              >
                <span className="ws-route-model">{modelId || "No model"}</span>
                <span className="ws-route-provider">{manifest.displayName}</span>
                <Icon name="chevron" size={12} />
              </button>
            </div>
          </div>

          {routeOpen ? (
            <>
              <button
                type="button"
                className="ws-popover-backdrop"
                aria-label="Close the route panel"
                onClick={() => setRouteOpen(false)}
              />
              <div className="ws-popover" role="dialog" aria-label="Route">
                <button type="button" className="icon-button ws-close" aria-label="Close" onClick={() => setRouteOpen(false)}>
                  <Icon name="plus" size={15} />
                </button>
                <ProfilePanel
                  manifests={enabledManifests}
                  manifest={manifest}
                  providerId={providerId}
                  onProviderChange={changeProvider}
                  modelId={modelId}
                  onModelChange={setModelId}
                  models={models}
                  catalogModel={catalogModel}
                  keyId={keyId}
                  keys={providerKeys}
                  onKeyChange={setKeyId}
                  baseUrl={baseUrl}
                  onBaseUrlChange={setBaseUrl}
                  baseUrlCheck={baseUrlCheck}
                  catalogSource={catalogSource}
                  canRoute={can(role, "route.manage")}
                  providerModels={providerModels}
                  modelsBusy={modelsBusy}
                  modelsError={modelsError}
                  onReloadModels={reloadModels}
                />
              </div>
            </>
          ) : null}

          {catalogWarning !== null ? (
            <div className="ws-warn" role="status">
              <Icon name="alert" size={12} />
              {catalogWarning}
            </div>
          ) : null}

          {view === "chat" ? (
            <ChatPanel
              messages={messages}
              streaming={streaming}
              canSend={canSend}
              blockReason={blockReason}
              onSend={send}
              onStop={stop}
              onErrorAction={onErrorAction}
              files={files}
              contextUsed={contextUsed}
              contextLimit={catalogModel?.contextLimit ?? null}
              approval={approval}
              onDecision={decideApproval}
            />
          ) : (
            <ArenaPanel
              models={models}
              canRun={canSend && can(role, "arena.run")}
              blockReason={
                !can(role, "arena.run")
                  ? "Your role cannot run the arena. Ask an owner to change your role."
                  : blockReason
              }
              onRun={runArena}
              onPick={pickArenaAnswer}
            />
          )}
        </main>

        <aside className="ws-inspect">
          <div className="ws-tabs" role="tablist" aria-label="Inspector">
            {INSPECT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inspect === tab.id}
                className="ws-tab"
                onClick={() => setInspect(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="ws-inspect-body">
            {inspect === "outbound" ? (
              <OutboundPanel
                provider={manifest.displayName}
                wireFormat={manifest.wireFormat}
                endpoint={effectiveBaseUrl ?? manifest.baseUrl}
                model={modelId}
                keyLabel={selectedKey?.label ?? (needsKey ? null : "No key")}
                messageCount={messages.filter((message) => message.error === undefined).length}
                toolsOn={toolsReady}
                toolCount={activeToolNames.length}
                priceIn={pricing?.input ?? null}
                priceOut={pricing?.output ?? null}
                spent={budget.spentUsd}
                limit={budget.limitUsd}
              />
            ) : inspect === "files" ? (
              <WorkspacePanel
                files={files}
                onRemove={(path) => {
                  workspace?.remove(path);
                  refreshFiles();
                }}
              />
            ) : lastTools.length > 0 ? (
              <ToolTrace events={lastTools} open />
            ) : (
              <p className="hint">No tool ran in this chat. Turn the agent on in Settings to give the model a tool.</p>
            )}
          </div>
        </aside>
      </div>

      <Shelf
        open={shelf.open}
        tab={shelf.tab}
        onTab={(tab) => setShelf({ open: true, tab })}
        onClose={() => setShelf((current) => ({ ...current, open: false }))}
        keys={
          <KeyPanel
            vault={session.vault}
            username={session.username}
            keys={keys}
            manifests={enabledManifests}
            onChanged={refreshKeys}
            canManage={can(role, "keys.manage")}
          />
        }
        profile={
          connections !== null ? (
            <ConnectionsPanel
              vault={session.vault}
              connections={connections}
              store={accountStorage(storage, session.username)}
              onChanged={setConnections}
            />
          ) : (
            <p className="hint">Sign in again to read the profile.</p>
          )
        }
        roles={
          role !== null && can(role, "roles.assign") ? (
            <RolesPanel
              accounts={accounts}
              assignments={assignments}
              currentUser={session.username}
              actorRole={role}
              error={roleError}
              onAssign={changeRole}
            />
          ) : null
        }
      />
    </div>
  );
}
