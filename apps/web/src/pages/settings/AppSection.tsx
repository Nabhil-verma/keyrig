import { resetSettings, useSettings, writeSettings } from "../../stores/settings";
import { Icon } from "../../components/ui/Icon";
import { Section } from "./Section";

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
