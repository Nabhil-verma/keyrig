import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatUsd } from "@keyrig/providers";
import { ErrorCard } from "./ErrorCard";
import type { UIMessage } from "./types";
import { BrandMark } from "./ui/BrandMark";
import { Icon } from "./ui/Icon";

interface ChatPanelProps {
  messages: UIMessage[];
  streaming: boolean;
  canSend: boolean;
  blockReason: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onErrorAction: (action: string, message: UIMessage) => void;
}

function number(value: number): string {
  return value.toLocaleString();
}

function priceText(message: UIMessage): string | null {
  if (message.costUsd === undefined) {
    return null;
  }
  return message.pricingKnown ? `${formatUsd(message.costUsd, true)} estimated` : "price unknown";
}

export function ChatPanel({ messages, streaming, canSend, blockReason, onSend, onStop, onErrorAction }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  const submit = (): void => {
    const text = draft.trim();
    if (text.length === 0 || !canSend || streaming) {
      return;
    }
    onSend(text);
    setDraft("");
  };

  return (
    <section className="chat">
      <div className="messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="hero">
              <span className="hero-badge">
                <Icon name="shield" size={12} />
                Keys stay in this browser. They go only to your provider.
              </span>
              <h1>
                One key. <span className="accent">Every model.</span>
              </h1>
              <p>
                keyrig is a BYOK harness. Add a provider key once, then route each prompt to the model that
                fits. Every answer shows its model, its key label and its estimated cost.
              </p>
            </div>

            <div className="feature-grid">
              <article className="feature">
                <span className="feature-icon">
                  <Icon name="lock" size={15} />
                </span>
                <h3>Encrypted at rest</h3>
                <p>WebCrypto with your passphrase. No server holds a key.</p>
              </article>
              <article className="feature">
                <span className="feature-icon">
                  <Icon name="check" size={15} />
                </span>
                <h3>Signed answers</h3>
                <p>Model, key label and token counts stay attached to each reply.</p>
              </article>
              <article className="feature">
                <span className="feature-icon">
                  <Icon name="wallet" size={15} />
                </span>
                <h3>Cost in view</h3>
                <p>Catalog prices become an estimate before you commit the run.</p>
              </article>
            </div>

            <ol className="steps">
              <li>
                <span className="step-num">01</span> Create an account
              </li>
              <li>
                <span className="step-num">02</span> Add a key
              </li>
              <li>
                <span className="step-num">03</span> Choose a model
              </li>
              <li>
                <span className="step-num">04</span> Send a prompt
              </li>
            </ol>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === "user" ? (
            <motion.article
              key={message.id}
              className="msg msg--user"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="msg-user-body">{message.content}</div>
            </motion.article>
          ) : (
            <motion.article
              key={message.id}
              className="msg msg--assistant"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="msg-head">
                <span className="msg-avatar">
                  <BrandMark size={16} />
                </span>
                <span className="msg-model">{message.model ?? "model"}</span>
                <span className="msg-role">answer</span>
              </div>

              {message.content.length > 0 ? <div className="msg-body">{message.content}</div> : null}

              {message.content.length === 0 && !message.error && streaming ? (
                <div className="typing" aria-label="The model is answering">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}

              {message.error ? (
                <ErrorCard error={message.error} onAction={(action) => onErrorAction(action, message)} />
              ) : null}

              {!message.error && message.content.length > 0 ? (
                <footer className="msg-meta">
                  <span className="chip chip--cyan">
                    <Icon name="cpu" size={10} />
                    {message.model}
                  </span>
                  <span className="chip">
                    <Icon name="key" size={10} />
                    {message.keyLabel ?? "key"}
                  </span>
                  {priceText(message) ? (
                    <span className={`chip ${message.pricingKnown ? "" : "chip--amber"}`}>
                      <Icon name="wallet" size={10} />
                      {priceText(message)}
                    </span>
                  ) : null}
                  {message.inputTokens !== undefined && message.outputTokens !== undefined ? (
                    <span className="chip">
                      {number(message.inputTokens)} in / {number(message.outputTokens)} out
                    </span>
                  ) : null}
                  {message.cachedTokens ? (
                    <span className="chip">{number(message.cachedTokens)} cached</span>
                  ) : null}
                  {message.stopReason === "partial" || message.stopReason === "aborted" ? (
                    <span className="chip chip--amber">
                      <Icon name="alert" size={10} />
                      {message.stopReason}
                    </span>
                  ) : null}
                </footer>
              ) : null}
            </motion.article>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          {blockReason ? (
            <div className="composer-block">
              <Icon name="alert" size={14} />
              <span>{blockReason}</span>
            </div>
          ) : null}
          <div className="composer-box">
            <textarea
              value={draft}
              rows={3}
              placeholder="Write a prompt. keyrig routes it to the selected model."
              aria-label="Prompt"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className="composer-foot">
              <span className="composer-hint">
                {streaming ? "Receiving the answer" : "Enter to send · Shift+Enter for a new line"}
              </span>
              <div className="composer-actions">
                {streaming ? (
                  <button type="button" className="btn btn--stop btn--sm" onClick={onStop}>
                    <Icon name="stop" size={13} />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!canSend || draft.trim().length === 0}
                    onClick={submit}
                  >
                    <Icon name="send" size={13} />
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
