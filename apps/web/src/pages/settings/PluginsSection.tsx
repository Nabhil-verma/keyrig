import { BUILTIN_MANIFESTS } from "@keyrig/providers";
import { useSettings, writeSettings } from "../../stores/settings";
import { Section } from "./Section";

export function PluginsSection() {
  const settings = useSettings();
  const enabledCount = BUILTIN_MANIFESTS.length - settings.disabledProviders.length;

  const toggle = (id: string, enabled: boolean): void => {
    writeSettings({
      disabledProviders: enabled
        ? settings.disabledProviders.filter((item) => item !== id)
        : [...settings.disabledProviders, id],
    });
  };

  return (
    <Section
      id="plugins"
      eyebrow="Plugins"
      title="Provider packs"
      text="Each provider is one manifest: its endpoint, its wire format and its abilities. A disabled provider leaves the key and route pickers."
    >
      <p className="hint">
        {enabledCount} of {BUILTIN_MANIFESTS.length} packs are on.
      </p>
      <ul className="settings-list">
        {BUILTIN_MANIFESTS.map((manifest) => {
          const enabled = !settings.disabledProviders.includes(manifest.id);
          return (
            <li key={manifest.id} className="settings-item">
              <div className="settings-item-main">
                <strong>{manifest.displayName}</strong>
                <p className="mono">
                  {manifest.wireFormat} · {manifest.baseUrl}
                </p>
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="settings-switch"
                  aria-pressed={enabled}
                  onClick={() => toggle(manifest.id, !enabled)}
                >
                  <span className="settings-switch-dot" />
                  {enabled ? "On" : "Off"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
