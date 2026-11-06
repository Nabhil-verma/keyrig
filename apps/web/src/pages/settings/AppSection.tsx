import { resetSettings, useSettings, writeSettings } from "../../stores/settings";
import { Icon } from "../../components/ui/Icon";
import { Section } from "./Section";

const LOCK_CHOICES = [5, 15, 30, 60] as const;

function lockValue(value: number | null): string {
  return value === null ? "off" : String(value);
}

function fromLockValue(value: string): number | null {
  return value === "off" ? null : Number(value);
}

export function AppSection() {
  const settings = useSettings();
  return (
    <Section
      id="app"
      eyebrow="App"
      title="How keyrig behaves"
      text="These settings change this browser only."
    >
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Remember the route</strong>
          <p>Open a new chat with the provider, the model and the key that this account used last.</p>
        </div>
        <button
          type="button"
          className="settings-switch"
          aria-pressed={settings.rememberRoute}
          onClick={() => writeSettings({ rememberRoute: !settings.rememberRoute })}
        >
          <span className="settings-switch-dot" />
          {settings.rememberRoute ? "On" : "Off"}
        </button>
      </div>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Lock the vault when idle</strong>
          <p>After this time without a click or a key, keyrig locks the keys and signs out.</p>
        </div>
        <select
          className="select"
          aria-label="Idle auto-lock"
          value={lockValue(settings.autoLockMinutes)}
          onChange={(event) => writeSettings({ autoLockMinutes: fromLockValue(event.target.value) })}
        >
          <option value="off">Off</option>
          {LOCK_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>Lock the vault while the tab is hidden</strong>
          <p>After this time in the background, keyrig locks the keys when you return.</p>
        </div>
        <select
          className="select"
          aria-label="Hidden auto-lock"
          value={lockValue(settings.lockOnHiddenMinutes)}
          onChange={(event) => writeSettings({ lockOnHiddenMinutes: fromLockValue(event.target.value) })}
        >
          <option value="off">Off</option>
          {LOCK_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </div>

      <div className="settings-note">
        <strong>Local only.</strong> Keys, skills, connectors and settings stay in this browser. keyrig has no
        server and runs no telemetry.
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn--ghost" onClick={() => resetSettings()}>
          <Icon name="refresh" size={13} />
          Reset the appearance and app settings
        </button>
      </div>
    </Section>
  );
}
