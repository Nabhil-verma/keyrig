import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { AgentApprovalRequest } from "@keyrig/core";
import { formatUsd } from "@keyrig/providers";
import { ApprovalCard } from "./ApprovalDialog";
import { ErrorCard } from "./ErrorCard";
import { SceneView } from "./SceneView";
import { ToolTrace } from "./ToolTrace";
import { applyToken, findToken } from "../lib/composerTokens";
import { takePendingPrompt, USE_PROMPT_EVENT } from "../lib/pendingPrompt";
import { listSkills } from "../stores/skills";
import type { UIMessage } from "../lib/types";
import { BrandMark } from "../ui/BrandMark";
import { Icon } from "../ui/Icon";
import type { WorkspaceFile } from "../stores/workspace";

interface ChatPanelProps {
  messages: UIMessage[];
  streaming: boolean;
  canSend: boolean;
  blockReason: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onErrorAction: (action: string, message: UIMessage) => void;
  files: WorkspaceFile[];
  contextUsed: number;
  contextLimit: number | null;
  approval: AgentApprovalRequest | null;
  onDecision: (decision: "approve" | "deny") => void;
}

interface MenuOption {
  key: string;
  label: string;
  detail: string;
  insert: string;
}

function tokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return String(value);
}

function priceText(message: UIMessage): string | null {
  if (message.costUsd === undefined) {
    return null;
  }
  return message.pricingKnown ? `${formatUsd(message.costUsd, true)} est.` : "price unknown";
}

/**
 * The answer stream and the composer. The composer offers `/` for a saved
 * skill and `@` for a workspace file (CX-04), a live token meter (CX-01) and
 * one approval card in the place where the answer arrives (AS-01).
 */
export function ChatPanel({
  messages,
  streaming,
  canSend,
  blockReason,
  onSend,
  onStop,
  onErrorAction,
  files,
  contextUsed,
  contextLimit,
  approval,
  onDecision,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastId = messages[messages.length - 1]?.id;

  // A skill fills the prompt. The event covers a chat that is already open.
  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending !== null) {
      setDraft(pending);
    }
    const onUse = (event: Event): void => {
      takePendingPrompt();
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        setDraft(detail);
      }
    };
    window.addEventListener(USE_PROMPT_EVENT, onUse);
    return () => window.removeEventListener(USE_PROMPT_EVENT, onUse);
  }, []);

  // A new message scrolls once. A running stream follows on a short timer.
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    endRef.current?.scrollIntoView({ block: "end" });
    if (!streaming) {
      return;
    }
    const timer = window.setInterval(() => endRef.current?.scrollIntoView({ block: "end" }), 250);
    return () => window.clearInterval(timer);
  }, [messages.length, streaming]);

  useEffect(() => {
    setDismissed(false);
  }, [draft]);

  const token = findToken(draft, cursor);
  const options = useMemo<MenuOption[]>(() => {
    if (token === null) {
      return [];
    }
    const query = token.query.toLowerCase();
    if (token.kind === "skill") {
      return listSkills()
        .filter((skill) => skill.name.toLowerCase().includes(query) || skill.prompt.toLowerCase().includes(query))
        .slice(0, 6)
        .map((skill) => ({
          key: skill.id,
          label: `/${skill.name}`,
          detail: skill.prompt.slice(0, 90),
          insert: skill.prompt,
        }));
    }
    return files
      .filter((file) => file.path.toLowerCase().includes(query))
      .slice(0, 6)
      .map((file) => ({
        key: file.path,
        label: `@${file.path}`,
        detail: `${file.content.length} characters`,
        insert: `@${file.path}`,
      }));
  }, [token, files]);

  const menuOpen = token !== null && options.length > 0 && !dismissed;

  const choose = (option: MenuOption): void => {
    if (token === null) {
      return;
    }
    const next = applyToken(draft, token, option.insert);
    setDraft(next);
    setCursor(next.length);
    setMenuIndex(0);
    areaRef.current?.focus();
  };

  const submit = (): void => {
    const text = draft.trim();
    if (text.length === 0 || !canSend || streaming) {
      return;
    }
    onSend(text);
    setDraft("");
    setCursor(0);
  };

  return (
    <section className="ws-chat">
      <div className="ws-stream" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ws-empty">
            <span className="hero-badge">
              <Icon name="shield" size={12} />
              Keys stay in this browser. They go only to your provider.
            </span>
            <h2>
              One key. <span className="accent">Every model.</span>
            </h2>
            <p>
              Add a provider key once, then route each prompt. Every answer shows its model, its key label and its
              estimated cost.
            </p>
            <div className="ws-empty-chips">
              <span className="chip">
                <Icon name="globe" size={11} /> No server
              </span>
              <span className="chip">
                <Icon name="eyeOff" size={11} /> Zero telemetry
              </span>
              <span className="chip">
                <Icon name="wallet" size={11} /> Cost in view
              </span>
              <span className="chip">
                <Icon name="bolt" size={11} /> / skill · @ file
              </span>
            </div>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === "user" ? (
            <motion.article
              key={message.id}
              className="ws-msg ws-msg--user"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              <div className="ws-user-body">{message.display ?? message.content}</div>
              {message.display !== undefined ? <span className="ws-user-note">with workspace files</span> : null}
            </motion.article>
          ) : (
            <motion.article
              key={message.id}
              className="ws-msg ws-msg--ai"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26 }}
            >
              <header className="ws-msg-head">
                <span className="ws-avatar">
                  <BrandMark size={15} />
                </span>
                <span className="ws-model">{message.model ?? "model"}</span>
                {message.keyLabel !== undefined ? (
                  <span className="ws-key">
                    <Icon name="key" size={10} />
                    {message.keyLabel}
                  </span>
                ) : null}
              </header>

              {message.tools !== undefined && message.tools.length > 0 ? (
                <ToolTrace events={message.tools} open={streaming && message.id === lastId} />
              ) : null}

              {message.content.length > 0 ? (
                <div className="ws-body">
                  {message.content}
                  {streaming && message.id === lastId ? <span className="stream-caret" aria-hidden="true" /> : null}
                </div>
              ) : message.error !== undefined ? null : streaming && message.id === lastId ? (
                <div className="typing" aria-label="The model is answering">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}

              {message.scene !== undefined ? <SceneView scene={message.scene} /> : null}

              {message.error !== undefined ? (
                <ErrorCard error={message.error} onAction={(action) => onErrorAction(action, message)} />
              ) : null}

              {message.error === undefined && message.content.length > 0 ? (
                <footer className="ws-meta">
                  <span>{message.model}</span>
                  <span>{message.keyLabel ?? "key"}</span>
                  {message.inputTokens !== undefined ? (
                    <span>
                      {message.inputTokens.toLocaleString()} in · {(message.outputTokens ?? 0).toLocaleString()} out
                    </span>
                  ) : null}
                  {message.cachedTokens !== undefined && message.cachedTokens > 0 ? (
                    <span>{message.cachedTokens.toLocaleString()} cached</span>
                  ) : null}
                  {priceText(message) !== null ? (
                    <span className={message.pricingKnown ? "" : "ws-meta-warn"}>{priceText(message)}</span>
                  ) : null}
                  {message.stopReason === "partial" ||
                  message.stopReason === "aborted" ||
                  message.stopReason === "limit" ? (
                    <span className="ws-meta-warn">{message.stopReason}</span>
                  ) : null}
                </footer>
              ) : null}
            </motion.article>
          ),
        )}

        {approval !== null ? <ApprovalCard request={approval} onDecision={onDecision} /> : null}
        <div ref={endRef} />
      </div>

      <div className="ws-composer">
        {blockReason !== null ? (
          <div className="ws-block">
            <Icon name="alert" size={13} />
            <span>{blockReason}</span>
          </div>
        ) : null}

        {menuOpen ? (
          <ul className="ws-menu" role="listbox" aria-label={token?.kind === "skill" ? "Skills" : "Workspace files"}>
            {options.map((option, index) => (
              <li key={option.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === menuIndex}
                  className="ws-menu-item"
                  data-active={index === menuIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                >
                  <span className="ws-menu-label mono">{option.label}</span>
                  <span className="ws-menu-detail">{option.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="ws-input">
          <textarea
            ref={areaRef}
            value={draft}
            rows={2}
            placeholder="Message the model. Type / for a skill, @ for a workspace file."
            aria-label="Prompt"
            onChange={(event) => {
              setDraft(event.target.value);
              setCursor(event.target.selectionStart ?? event.target.value.length);
            }}
            onClick={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
            onKeyUp={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={(event) => {
              if (menuOpen) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMenuIndex((index) => (index + 1) % options.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMenuIndex((index) => (index - 1 + options.length) % options.length);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDismissed(true);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const option = options[menuIndex];
                  if (option !== undefined) {
                    choose(option);
                  }
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="ws-input-foot">
            <span className="ws-meter mono">
              {contextLimit === null
                ? `${tokenCount(contextUsed)} tokens`
                : `${tokenCount(contextUsed)} / ${tokenCount(contextLimit)}`}
            </span>
            <div className="ws-input-actions">
              <span className="ws-hint">Enter to send · Shift+Enter for a line</span>
              {streaming ? (
                <button type="button" className="btn btn--stop btn--sm" onClick={onStop}>
                  <Icon name="stop" size={12} />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={!canSend || draft.trim().length === 0}
                  onClick={submit}
                >
                  <Icon name="send" size={12} />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
