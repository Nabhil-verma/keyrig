import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatUsd, type CatalogModel } from "@keyrig/providers";
import { ErrorCard } from "./ErrorCard";
import { fadeUp, stagger } from "./motion";
import type { ArenaResult } from "./types";
import { Icon } from "./ui/Icon";

interface ArenaPanelProps {
  models: CatalogModel[];
  canRun: boolean;
  blockReason: string | null;
  onRun: (prompt: string, models: string[]) => Promise<ArenaResult[]>;
  onPick: (prompt: string, result: ArenaResult) => void;
}

export function ArenaPanel({ models, canRun, blockReason, onRun, onPick }: ArenaPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [manual, setManual] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<ArenaResult[]>([]);
  const [running, setRunning] = useState(false);

  const manualModels = manual
    .split(/[\n,]/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const options: Array<{ id: string; name: string; pricing?: CatalogModel["pricing"] }> =
    models.length > 0
      ? models.map((model) => ({
          id: model.id,
          name: model.name,
          ...(model.pricing ? { pricing: model.pricing } : {}),
        }))
      : manualModels.map((id) => ({ id, name: id }));

  const toggle = (model: string): void => {
    setSelected((current) =>
      current.includes(model) ? current.filter((item) => item !== model) : [...current, model],
    );
  };

  const run = async (): Promise<void> => {
    const text = prompt.trim();
    if (text.length === 0 || selected.length === 0 || running) {
      return;
    }
    setRunning(true);
    try {
      setResults(await onRun(text, selected));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="arena">
      <div className="arena-inner">
        <motion.p className="arena-intro" variants={fadeUp} initial="hidden" animate="show">
          Send one prompt to many models at the same time. Compare the answer, the latency and the estimated
          cost, then continue the chat with the answer you choose.
        </motion.p>

        <motion.div
          className="arena-setup"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          transition={{ delay: 0.06 }}
        >
          <div className="field">
            <label htmlFor="arena-prompt">Prompt</label>
            <textarea
              id="arena-prompt"
              className="textarea arena-prompt"
              rows={3}
              value={prompt}
              placeholder="One prompt for every selected model."
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>

          {models.length === 0 ? (
            <div className="field">
              <label htmlFor="arena-models">Model names, one for each line</label>
              <textarea
                id="arena-models"
                className="textarea mono"
                rows={2}
                value={manual}
                placeholder="For example: llama3.2"
                onChange={(event) => setManual(event.target.value)}
              />
              <p className="hint">
                The catalog has no models for this provider. Add one name for each line.
              </p>
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">Models</span>
            <div className="model-grid" role="group" aria-label="Models for the arena">
              {options.length === 0 ? <p className="hint">Add a model name first.</p> : null}
              {options.slice(0, 40).map((model) => (
                <label key={model.id} className="model-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(model.id)}
                    onChange={() => toggle(model.id)}
                  />
                  <span className="model-option-name">{model.name}</span>
                  {model.pricing ? (
                    <span className="model-option-price">
                      {formatUsd(model.pricing.input)} / {formatUsd(model.pricing.output)}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>

          {blockReason ? (
            <div className="composer-block">
              <Icon name="alert" size={14} />
              <span>{blockReason}</span>
            </div>
          ) : null}

          <div className="arena-run">
            <span className="arena-run-note">
              {selected.length === 0
                ? "Choose at least one model."
                : `${selected.length} selected · each answer shows its own cost`}
            </span>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--glow"
              disabled={!canRun || running || selected.length === 0 || prompt.trim().length === 0}
              onClick={() => void run()}
            >
              <Icon name="arena" size={14} />
              {running ? "The models are answering" : `Run ${selected.length || ""} models`}
            </button>
          </div>
        </motion.div>

        {running && results.length === 0 ? (
          <div className="arena-skeletons" aria-hidden="true">
            <span className="arena-skeleton" />
            <span className="arena-skeleton" />
            <span className="arena-skeleton" />
          </div>
        ) : null}

        {!running && results.length === 0 ? (
          <div className="arena-empty">
            <span className="eyebrow eyebrow--cyan">Comparison</span>
            <p>Run the prompt to compare the answers, the time and the cost.</p>
          </div>
        ) : null}

        <AnimatePresence mode="popLayout">
          {results.length > 0 ? (
            <motion.div
              className="arena-results"
              variants={stagger(0.07)}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -8 }}
              style={{ gridTemplateColumns: `repeat(${Math.min(results.length, 3)}, minmax(0, 1fr))` }}
            >
            {results.map((result) => (
              <motion.article
                key={result.model}
                className="arena-result"
                variants={fadeUp}
                layout
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <header className="arena-result-head">
                  <strong>{result.model}</strong>
                  <span className="arena-time">{(result.durationMs / 1000).toFixed(1)}s</span>
                </header>
                {result.error ? (
                  <ErrorCard
                    error={result.error}
                    onAction={() =>
                      setResults((current) => current.filter((item) => item.model !== result.model))
                    }
                  />
                ) : (
                  <>
                    <p className="arena-text">{result.text}</p>
                    <footer className="arena-result-foot">
                      <span className={`chip ${result.pricingKnown ? "" : "chip--amber"}`}>
                        <Icon name="wallet" size={10} />
                        {result.pricingKnown
                          ? `${formatUsd(result.costUsd, true)} estimated`
                          : "price unknown"}
                      </span>
                      <span className="chip">
                        {result.inputTokens} in / {result.outputTokens} out
                      </span>
                    </footer>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => onPick(prompt, result)}
                    >
                      <Icon name="check" size={13} />
                      Continue with this answer
                    </button>
                  </>
                )}
              </motion.article>
            ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
