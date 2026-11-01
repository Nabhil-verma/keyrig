import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountRecord, AgentApprovalRequest, KeyView, RoleAssignment, RoleId, SignedInAccount } from "@keyrig/core";
import {
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
  readAssignments,
  signIn,
  signUp,
} from "@keyrig/core";
import {
  BUILTIN_MANIFESTS,
  checkBaseUrl,
  findModel,
  getManifest,
  loadCatalog,
  modelsForProvider,
  type Catalog,
  type CatalogSource,
  type ProviderManifest,
} from "@keyrig/providers";
import { ArenaPanel } from "../components/ArenaPanel";
import { ChatPanel } from "../components/ChatPanel";
import { ConnectionsPanel } from "../components/ConnectionsPanel";
import { KeyPanel } from "../components/KeyPanel";
import { RolesPanel } from "../components/RolesPanel";
import { Shelf, type ShelfTab } from "../components/Shelf";
import { Inspector, type InspectTab } from "./workspace/Inspector";
import { RoutePopover } from "./workspace/RoutePopover";
import { SignedOutStage } from "./workspace/SignedOutStage";
import { ThreadRail } from "./workspace/ThreadRail";
import { WorkspaceHeader } from "./workspace/WorkspaceHeader";
import { readConnections, type AccountConnections } from "../stores/connections";
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
import { Icon } from "../components/ui/Icon";
import { Workspace, type WorkspaceFile } from "../stores/workspace";
import { safeError } from "./workspace/chatTurnHelpers";
import { useChatTurns } from "./workspace/useChatTurns";

const storage = browserStorage();

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

  const { send, stop, decideApproval, onErrorAction, runArena } = useChatTurns({
    session,
    needsKey,
    selectedKey,
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
    onOpenKeys: () => setShelf({ open: true, tab: "keys" }),
    onOpenRoute: () => setRouteOpen(true),
  });

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
    return <SignedOutStage onSignUp={handleSignUp} onSignIn={handleSignIn} onImport={handleImport} />;
  }

  return (
    <div className="ws">
      <WorkspaceHeader
        username={session.username}
        view={view}
        onView={setView}
        totalCost={totalCost}
        theme={theme}
        onToggleTheme={() => writeSettings({ theme: theme === "dark" ? "light" : "dark" })}
        onSignOut={signOut}
      />

      <div className="ws-body">
        <ThreadRail
          username={session.username}
          role={role}
          threads={filteredThreads}
          activeId={activeId}
          search={search}
          onSearch={setSearch}
          onNewChat={newChat}
          onOpenThread={openThread}
          onDeleteThread={deleteThread}
          budget={budget}
          budgetStop={budgetStop}
          onContinue={() => setOverBudget(true)}
          onOpenShelf={(tab) => setShelf({ open: true, tab })}
        />

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
            <RoutePopover
              onClose={() => setRouteOpen(false)}
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

        <Inspector
          tab={inspect}
          onTab={setInspect}
          providerName={manifest.displayName}
          wireFormat={manifest.wireFormat}
          endpoint={effectiveBaseUrl ?? manifest.baseUrl}
          modelId={modelId}
          keyLabel={selectedKey?.label ?? (needsKey ? null : "No key")}
          messageCount={messages.filter((message) => message.error === undefined).length}
          toolsOn={toolsReady}
          toolCount={activeToolNames.length}
          priceIn={pricing?.input ?? null}
          priceOut={pricing?.output ?? null}
          spent={budget.spentUsd}
          limit={budget.limitUsd}
          files={files}
          onRemoveFile={(path) => {
            workspace?.remove(path);
            refreshFiles();
          }}
          tools={lastTools}
        />
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
