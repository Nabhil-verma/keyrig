import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyView, SignedInAccount } from "@keyrig/core";
import { createUsageBus, sendChat, signIn, signUp } from "@keyrig/core";
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
import { ArenaPanel } from "./ArenaPanel";
import { AuthPanel } from "./AuthPanel";
import { ChatPanel } from "./ChatPanel";
import { KeyPanel } from "./KeyPanel";
import { ProfilePanel } from "./ProfilePanel";
import { browserStorage } from "./storage";
import { motion } from "framer-motion";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { newId, type ArenaResult, type UIMessage } from "./types";
import { Icon } from "./ui/Icon";

const storage = browserStorage();

const TABS = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "arena", label: "Arena", icon: "arena" },
] as const;

function safeError(caught: unknown): KeyrigErrorJSON {
  return isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
}

function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages
    .filter((message) => !message.error && message.content.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.content }));
}

export default function App() {
  const [session, setSession] = useState<SignedInAccount | null>(null);
  const [keys, setKeys] = useState<KeyView[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [providerId, setProviderId] = useState("openai");
  const [modelId, setModelId] = useState("gpt-5.4");
  const [keyId, setKeyId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [tab, setTab] = useState<"chat" | "arena">("chat");
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [totalCost, setTotalCost] = useState(0);

  const bus = useMemo(() => createUsageBus(), []);
  const abortRef = useRef<AbortController | null>(null);
  const keysRef = useRef<HTMLDivElement | null>(null);

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
    const unsubscribe = bus.subscribe((event) => setTotalCost((value) => value + event.costUsd));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bus]);

  const manifest = (getManifest(BUILTIN_MANIFESTS, providerId) ?? BUILTIN_MANIFESTS[0]) as ProviderManifest;
  const models = useMemo(() => (catalog ? modelsForProvider(catalog, providerId) : []), [catalog, providerId]);
  const catalogModel = useMemo(
    () => (catalog ? findModel(catalog, providerId, modelId) : undefined),
    [catalog, providerId, modelId],
  );
  const pricing = catalogModel?.pricing;
  const providerKeys = keys.filter((key) => key.providerId === providerId);
  const selectedKey = keys.find((key) => key.id === keyId);

  useEffect(() => {
    const available = keys.filter((key) => key.providerId === providerId);
    if (!available.some((key) => key.id === keyId)) {
      setKeyId(available[0]?.id ?? "");
    }
  }, [keys, providerId, keyId]);

  const baseUrlCheck =
    manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? checkBaseUrl(baseUrl.trim()) : null;
  const customBaseBlocked = baseUrlCheck !== null && !baseUrlCheck.allowed;
  const effectiveBaseUrl = manifest.supportsCustomBaseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : undefined;

  const blockReason = !session
    ? "Sign in to start."
    : providerKeys.length === 0
      ? `Add a key for ${manifest.displayName}.`
      : modelId.trim().length === 0
        ? "Choose a model."
        : customBaseBlocked
          ? (baseUrlCheck?.warning ?? "The base URL is not allowed.")
          : (baseUrlCheck?.warning ?? null);

  const canSend =
    session !== null &&
    providerKeys.length > 0 &&
    keyId.length > 0 &&
    modelId.trim().length > 0 &&
    !customBaseBlocked &&
    !streaming;

  const runAssistant = useCallback(
    async (assistantId: string, history: UIMessage[]): Promise<void> => {
      if (!session || !selectedKey) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      try {
        const outcome = await sendChat({
          vault: session.vault,
          keyId: selectedKey.id,
          manifest,
          model: modelId.trim(),
          messages: toChatMessages(history),
          ...(pricing !== undefined ? { pricing } : {}),
          ...(effectiveBaseUrl !== undefined ? { baseUrl: effectiveBaseUrl } : {}),
          bus,
          signal: controller.signal,
          handlers: {
            onDelta: (text) => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId ? { ...message, content: message.content + text } : message,
                ),
              );
            },
          },
        });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: outcome.result.text,
                  model: modelId,
                  providerId,
                  keyLabel: outcome.key.label,
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
        const error = safeError(caught);
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, error } : message)),
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [session, selectedKey, manifest, modelId, pricing, effectiveBaseUrl, bus, providerId],
  );

  const send = useCallback(
    (text: string): void => {
      const at = new Date().toISOString();
      const user: UIMessage = { id: newId(), role: "user", content: text, at };
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
      void runAssistant(assistant.id, [...messages, user]);
    },
    [messages, modelId, providerId, selectedKey, runAssistant],
  );

  const stop = (): void => {
    abortRef.current?.abort();
  };

  const clearChat = (): void => {
    if (streaming) {
      return;
    }
    setMessages([]);
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
      keysRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "switch_model") {
      document.getElementById("model")?.focus();
      return;
    }
    if (action === "dismiss") {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      return;
    }
    keysRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runArena = async (prompt: string, chosen: string[]): Promise<ArenaResult[]> => {
    if (!session || !selectedKey) {
      return [];
    }
    return Promise.all(
      chosen.map(async (model) => {
        const started = performance.now();
        try {
          const outcome = await sendChat({
            vault: session.vault,
            keyId: selectedKey.id,
            manifest,
            model,
            messages: [{ role: "user", content: prompt }],
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
    setTab("chat");
  };

  const changeProvider = (next: string): void => {
    const nextManifest = getManifest(BUILTIN_MANIFESTS, next);
    setProviderId(next);
    setModelId(nextManifest?.defaultModel ?? "");
    setBaseUrl(nextManifest?.supportsCustomBaseUrl ? nextManifest.baseUrl : "");
  };

  const enterSession = (account: SignedInAccount): void => {
    setSession(account);
    setKeys(account.vault.listKeys());
    setMessages([]);
    setTotalCost(0);
    setTab("chat");
  };

  const handleSignUp = async (username: string, password: string): Promise<void> => {
    enterSession(await signUp({ storage, username, password }));
  };

  const handleSignIn = async (username: string, password: string): Promise<void> => {
    enterSession(await signIn({ storage, username, password }));
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
    setMessages([]);
    setTotalCost(0);
    setKeyId("");
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
          <AuthPanel onSignUp={handleSignUp} onSignIn={handleSignIn} />
        </main>

        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="app">
      <SiteHeader
        nav={
          <nav className="tabs" role="tablist" aria-label="Workspace">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {tab === item.id ? (
                  <motion.span
                    layoutId="tab-pill"
                    className="tab-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
                <Icon name={item.icon} size={15} />
                <span className="tab-label">{item.label}</span>
              </button>
            ))}
          </nav>
        }
        actions={
          <>
            <span className="status-chip" data-state="unlocked" title={`Signed in as ${session.username}`}>
              <span className="status-dot" />
              <span>{session.username}</span>
            </span>
            <div className="cost-tile">
              <span className="eyebrow">Session cost</span>
              <span className="cost-value">{formatUsd(totalCost)}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
              <Icon name="lock" size={12} />
              Sign out
            </button>
          </>
        }
      />

      <main className="shell">
        <aside className="rail" ref={keysRef}>
          <KeyPanel vault={session.vault} keys={keys} manifests={BUILTIN_MANIFESTS} onChanged={refreshKeys} />

          <ProfilePanel
            manifests={BUILTIN_MANIFESTS}
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
          />

          {catalogWarning ? (
            <div className="callout callout--cyan" role="status">
              <strong>Catalog.</strong> {catalogWarning}
            </div>
          ) : null}

          <div className="privacy">
            <span className="privacy-icon">
              <Icon name="shield" size={17} />
            </span>
            <div>
              <strong>Keys stay local</strong>
              <p>Encrypted in this browser with your password. No keyrig server. Telemetry is off.</p>
            </div>
          </div>
        </aside>

        <section className="workspace">
          <div className="workspace-bar">
            <div className="workspace-title">
              <span className="eyebrow">{tab === "chat" ? "Chat workspace" : "Comparison"}</span>
              <strong>{tab === "chat" ? (modelId || "No model") : "Model arena"}</strong>
            </div>
            <div className="workspace-chips">
              <span className="chip">{manifest.displayName}</span>
              {selectedKey ? (
                <span className="chip chip--amber">
                  <Icon name="key" size={10} />
                  {selectedKey.label}
                </span>
              ) : null}
              <span className={`chip ${pricing ? "" : "chip--amber"}`}>
                <Icon name="wallet" size={10} />
                {pricing ? `${formatUsd(pricing.input)} / M in` : "price unknown"}
              </span>
              {tab === "chat" ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={messages.length === 0 || streaming}
                  onClick={clearChat}
                >
                  <Icon name="plus" size={12} />
                  New chat
                </button>
              ) : null}
            </div>
          </div>

          {tab === "chat" ? (
            <ChatPanel
              messages={messages}
              streaming={streaming}
              canSend={canSend}
              blockReason={blockReason}
              onSend={send}
              onStop={stop}
              onErrorAction={onErrorAction}
            />
          ) : (
            <ArenaPanel
              models={models}
              canRun={canSend}
              blockReason={blockReason}
              onRun={runArena}
              onPick={pickArenaAnswer}
            />
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
