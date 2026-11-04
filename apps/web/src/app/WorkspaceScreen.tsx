import { useCallback, useMemo, useRef, useState } from "react";
import type {
  AccountRecord,
  AgentApprovalRequest,
  KeyView,
  RoleAssignment,
  RoleId,
  SignedInAccount,
} from "@keyrig/core";
import {
  accountStorage,
  assignRole,
  budgetMessage,
  budgetState,
  buildSystemPrompt,
  can,
  ensureAccountRole,
  importVault,
  listAccounts,
  readAssignments,
  signIn,
  signUp,
} from "@keyrig/core";
import { BUILTIN_MANIFESTS } from "@keyrig/providers";
import { ArenaPanel } from "../components/ArenaPanel";
import { ChatPanel } from "../components/ChatPanel";
import { Dashboard } from "./workspace/Dashboard";
import { ConnectionsPanel } from "../components/ConnectionsPanel";
import { KeyPanel } from "../components/KeyPanel";
import { RolesPanel } from "../components/RolesPanel";
import { Shelf, type ShelfTab } from "../components/Shelf";
import { Inspector, type InspectTab } from "./workspace/Inspector";
import { RoutePopover } from "./workspace/RoutePopover";
import { SignedOutStage } from "./workspace/SignedOutStage";
import { ThreadRail } from "./workspace/ThreadRail";
import { UndoDeleteBar } from "./workspace/UndoDeleteBar";
import { WorkspaceHeader } from "./workspace/WorkspaceHeader";
import { readConnections, type AccountConnections } from "../stores/connections";
import { useSettings, writeSettings } from "../stores/settings";
import {
  atMessageCap,
  atThreadCap,
  MAX_THREADS,
  MAX_THREADS_MESSAGES,
  threadPreview,
} from "../stores/threads";
import { activeTools, useAgentSettings } from "../stores/toolSettings";
import { newId, type ArenaResult } from "../lib/types";
import { downloadText, fileSafeName, threadToMarkdown } from "../lib/threadExport";
import { threadReceiptSvg } from "../lib/receipt";
import { Icon } from "../components/ui/Icon";
import { Workspace, type WorkspaceFile } from "../stores/workspace";
import { browserStorage } from "../lib/storage";
import { safeError } from "./workspace/chatTurnHelpers";
import { useChatRoute } from "./workspace/useChatRoute";
import { useChatThreads } from "./workspace/useChatThreads";
import { useChatTurns } from "./workspace/useChatTurns";
import { useSpendTracking } from "./workspace/useSpendTracking";

const storage = browserStorage();

/** The last message that matches, so the chat shows its newest facts. */
function lastWhere<T>(items: readonly T[], test: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && test(item)) {
      return item;
    }
  }
  return undefined;
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
  const [role, setRole] = useState<RoleId | null>(null);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [connections, setConnections] = useState<AccountConnections | null>(null);
  const [approval, setApproval] = useState<AgentApprovalRequest | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [view, setView] = useState<"home" | "chat" | "arena">("home");
  const [streaming, setStreaming] = useState(false);
  const [overBudget, setOverBudget] = useState(false);
  const [search, setSearch] = useState("");
  const [shelf, setShelf] = useState<{ open: boolean; tab: ShelfTab }>({ open: false, tab: "keys" });
  const [routeOpen, setRouteOpen] = useState(false);
  const [inspect, setInspect] = useState<InspectTab>("outbound");
  const agentSettings = useAgentSettings();

  const abortRef = useRef<AbortController | null>(null);
  const approvalRef = useRef<((decision: "approve" | "deny") => void) | null>(null);

  const accountStore = useMemo(
    () => (session === null ? null : accountStorage(storage, session.username)),
    [session],
  );
  /** AS-05: one workspace for the signed-in account. */
  const workspace = useMemo(
    () => (accountStore === null ? null : new Workspace({ storage: accountStore })),
    [accountStore],
  );
  const refreshFiles = useCallback(() => {
    setFiles(workspace === null ? [] : workspace.files());
  }, [workspace]);

  const spend = useSpendTracking(storage);
  const {
    catalog,
    catalogSource,
    catalogWarning,
    providerId,
    modelId,
    setModelId,
    keyId,
    setKeyId,
    baseUrl,
    setBaseUrl,
    manifest,
    needsKey,
    models,
    catalogModel,
    pricing,
    providerKeys,
    selectedKey,
    providerModels,
    modelsBusy,
    modelsError,
    baseUrlCheck,
    customBaseBlocked,
    effectiveBaseUrl,
    restoreRoute,
    changeProvider,
    reloadModels,
  } = useChatRoute({
    storage,
    username: session?.username ?? null,
    session,
    keys,
    role,
    manifests: enabledManifests,
    rememberRoute: settings.rememberRoute,
  });

  const abortTurn = (): void => {
    abortRef.current?.abort();
  };
  const leaveThread = (): void => {
    abortRef.current?.abort();
    approvalRef.current?.("deny");
    approvalRef.current = null;
    setApproval(null);
  };

  const {
    threads,
    activeId,
    activeThread,
    messages,
    setMessages,
    arenaRun,
    setArenaRun,
    pendingUndo,
    loadAccount,
    clear: clearThreads,
    openThread,
    newChat,
    deleteThread,
    undoLastDelete,
    dismissUndo,
    threadForExport,
  } = useChatThreads({
    storage,
    username: session?.username ?? null,
    canDelete: !streaming,
    onAbortTurn: abortTurn,
    onLeaveThread: leaveThread,
    onShowChat: () => setView("chat"),
  });

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
  const budget = budgetState(spend.spentToday, settings.dailyBudgetUsd);
  const budgetStop = budget.level === "blocked" && !overBudget;
  const theme = settings.theme === "light" ? "light" : "dark";

  const filteredThreads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) {
      return threads;
    }
    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(needle) ||
        threadPreview(thread).toLowerCase().includes(needle) ||
        thread.messages.some((message) =>
          (message.display ?? message.content).toLowerCase().includes(needle),
        ),
    );
  }, [threads, search]);

  const lastTools = useMemo(
    () => lastWhere(messages, (message) => message.role === "assistant" && message.tools !== undefined)?.tools ?? [],
    [messages],
  );

  const contextUsed = useMemo(() => {
    const message = lastWhere(
      messages,
      (item) => item.role === "assistant" && item.inputTokens !== undefined,
    );
    return (message?.inputTokens ?? 0) + (message?.outputTokens ?? 0);
  }, [messages]);

  const blockReason = ((): string | null => {
    if (session === null) {
      return "Sign in to start.";
    }
    if (!can(role, "chat.send")) {
      return "Your role cannot send prompts. Ask an owner to change your role.";
    }
    if (budgetStop) {
      return budgetMessage(budget) ?? "The daily budget is spent.";
    }
    if (needsKey && providerKeys.length === 0) {
      return `Add a key for ${manifest.displayName}.`;
    }
    if (modelId.trim().length === 0) {
      return "Choose a model.";
    }
    if (customBaseBlocked) {
      return baseUrlCheck?.warning ?? "The base URL is not allowed.";
    }
    return baseUrlCheck?.warning ?? null;
  })();

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
    keys: providerKeys,
    onKeyChange: setKeyId,
    manifest,
    modelId,
    providerId,
    pricing,
    effectiveBaseUrl,
    catalog,
    bus: spend.bus,
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

  const runArenaTurn = async (prompt: string, chosen: string[]): Promise<ArenaResult[]> => {
    const results = await runArena(prompt, chosen);
    setArenaRun({ prompt, at: new Date().toISOString(), results });
    return results;
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

  const enterSession = (account: SignedInAccount): void => {
    const deviceKeys = account.vault.listKeys();
    const store = accountStorage(storage, account.username);

    setSession(account);
    setKeys(deviceKeys);
    setRole(ensureAccountRole({ storage }, account.username));
    setAccounts(listAccounts(storage));
    setAssignments(readAssignments({ storage }));
    setRoleError(null);
    loadAccount(account.username);
    restoreRoute(account.username, deviceKeys);
    spend.beginSession();
    setOverBudget(false);
    setView("home");
    setConnections(readConnections(store));
    setApproval(null);
    setFiles(new Workspace({ storage: store }).files());
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
    setRole(null);
    setAccounts([]);
    setAssignments([]);
    setRoleError(null);
    setShelf({ open: false, tab: "keys" });
    clearThreads();
    setOverBudget(false);
    setKeyId("");
    setConnections(null);
    setApproval(null);
    setFiles([]);
    setRouteOpen(false);
    spend.endSession();
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

  /** Item 7: one chat leaves as a file. The file holds no key secret. */
  const exportThread = (): void => {
    const thread = threadForExport();
    if (thread === null) {
      return;
    }
    downloadText(`${fileSafeName(thread.title)}.md`, threadToMarkdown(thread));
  };

  /** Item 15: the facts of the chat as one shareable card. */
  const shareReceipt = (): void => {
    const thread = threadForExport();
    if (thread === null) {
      return;
    }
    downloadText(`${fileSafeName(thread.title)}-receipt.svg`, threadReceiptSvg(thread), "image/svg+xml");
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
        totalCost={spend.totalCost}
        theme={theme}
        canExport={messages.length > 0}
        onExport={exportThread}
        onShareReceipt={shareReceipt}
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
          atCap={atThreadCap(threads)}
          onContinue={() => setOverBudget(true)}
          onOpenShelf={(tab) => setShelf({ open: true, tab })}
        />

        <main className="ws-main">
          {view === "home" ? (
            <Dashboard
              username={session.username}
              displayName={settings.displayName}
              role={role}
              keys={keys}
              agentSettings={agentSettings}
              threads={threads}
              spendDays={spend.spendDays}
              onNewChat={newChat}
              onOpenThread={openThread}
              onOpenArena={() => setView("arena")}
              onOpenKeys={() => setShelf({ open: true, tab: "keys" })}
            />
          ) : null}

          {view === "home" ? null : (
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
          )}

          {view !== "home" && routeOpen ? (
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

          {view !== "home" && catalogWarning !== null ? (
            <div className="ws-warn" role="status">
              <Icon name="alert" size={12} />
              {catalogWarning}
            </div>
          ) : null}

          {view === "chat" && atMessageCap(messages) ? (
            <div className="ws-warn" role="status">
              <Icon name="alert" size={12} />
              This chat holds {MAX_THREADS_MESSAGES} messages. Only the newest {MAX_THREADS_MESSAGES} are saved.
              Export the chat to keep the full record.
            </div>
          ) : null}

          {view === "home" ? null : view === "chat" ? (
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
              priceIn={pricing?.input ?? null}
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
              onRun={runArenaTurn}
              onPick={pickArenaAnswer}
              saved={arenaRun}
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
          requests={spend.usage}
          days={spend.spendDays}
        />
      </div>

      {pendingUndo !== null ? (
        <UndoDeleteBar title={pendingUndo.title} onUndo={undoLastDelete} onDismiss={dismissUndo} />
      ) : null}

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
              store={accountStore ?? accountStorage(storage, session.username)}
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
