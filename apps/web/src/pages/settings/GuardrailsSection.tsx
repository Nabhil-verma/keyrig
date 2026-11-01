import { useState } from "react";
import {
  MAX_BUDGET_USD,
  MAX_INSTRUCTIONS_CHARS,
  MIN_BUDGET_USD,
  budgetMessage,
  budgetState,
  normalizeBudgetLimit,
} from "@keyrig/core";
import { formatUsd } from "@keyrig/providers";
import { browserStorage } from "../../lib/storage";
import { readSpend } from "../../stores/spendStore";
import { useSettings, writeSettings } from "../../stores/settings";
import { Section } from "./Section";

export function GuardrailsSection() {
  const settings = useSettings();
  const state = budgetState(readSpend(browserStorage()), settings.dailyBudgetUsd);
  const [limit, setLimit] = useState(
    settings.dailyBudgetUsd === null ? "" : String(settings.dailyBudgetUsd),
  );

  const commitLimit = (raw: string): void => {
    setLimit(raw);
    const value = raw.trim().length === 0 ? null : Number(raw);
    writeSettings({ dailyBudgetUsd: normalizeBudgetLimit(value) });
  };

  return (
    <Section
      id="guardrails"
      eyebrow="Guardrails"
      title="Prompt and budget"
      text="keyrig sends a guard prompt before every request. These settings change this browser only."
    >
      <div className="field">
        <label htmlFor="instructions">Extra instructions</label>
        <textarea
          id="instructions"
          className="textarea"
          rows={4}
          maxLength={MAX_INSTRUCTIONS_CHARS}
          value={settings.instructions}
          placeholder="For example: answer in short paragraphs."
          onChange={(event) => writeSettings({ instructions: event.target.value })}
        />
        <p className="hint">
          {settings.instructions.length} of {MAX_INSTRUCTIONS_CHARS} characters. The safety rules come first.
          These instructions cannot turn off a safety rule.
        </p>
      </div>

      <div className="field">
        <label htmlFor="daily-budget">Daily budget in USD</label>
        <input
          id="daily-budget"
          className="input mono"
          type="number"
          min={MIN_BUDGET_USD}
          max={MAX_BUDGET_USD}
          step="0.01"
          value={limit}
          placeholder="No limit"
          onChange={(event) => commitLimit(event.target.value)}
        />
        <p className="hint">
          keyrig warns at 80 percent and stops at 100 percent. Leave the field empty for no limit.
        </p>
      </div>

      <div className="settings-note">
        <strong>Today.</strong> {formatUsd(state.spentUsd)} is spent on this device.{" "}
        {budgetMessage(state) ?? "No limit is set."}
      </div>
    </Section>
  );
}
