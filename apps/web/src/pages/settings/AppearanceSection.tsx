import { useSettings, writeSettings } from "../../stores/settings";
import { Section } from "./Section";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="segmented-item"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const settings = useSettings();
  return (
    <Section
      id="appearance"
      eyebrow="Appearance"
      title="How keyrig looks"
      text="The theme, the motion, the density and the accent stay on this device."
    >
      <Segmented
        label="Theme"
        value={settings.theme}
        onChange={(theme) => writeSettings({ theme })}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
          { value: "system", label: "System" },
        ]}
      />
      <Segmented
        label="Motion"
        value={settings.motion}
        onChange={(motion) => writeSettings({ motion })}
        options={[
          { value: "full", label: "Full" },
          { value: "reduced", label: "Reduced" },
        ]}
      />
      <Segmented
        label="Density"
        value={settings.density}
        onChange={(density) => writeSettings({ density })}
        options={[
          { value: "comfortable", label: "Comfortable" },
          { value: "compact", label: "Compact" },
        ]}
      />

      <div className="field">
        <label htmlFor="accent">Accent</label>
        <div className="settings-accent">
          <input
            id="accent"
            type="color"
            className="settings-color"
            value={settings.accent ?? "#f5b83d"}
            onChange={(event) => writeSettings({ accent: event.target.value })}
          />
          <span className="mono settings-accent-value">{settings.accent ?? "brand amber"}</span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={settings.accent === null}
            onClick={() => writeSettings({ accent: null })}
          >
            Reset
          </button>
        </div>
        <p className="hint">
          The brand kit gives amber to the key and cyan to the AI link. A custom accent replaces amber on both
          themes.
        </p>
      </div>
    </Section>
  );
}
