import { useState, type ReactNode } from "react";
import { BUILTIN_MANIFESTS } from "@keyrig/providers";
import {
  addConnector,
  checkConnectorUrl,
  listConnectors,
  removeConnector,
  revokeConnectorConsent,
  setConnectorConsent,
  setConnectorTools,
  type Connector,
  type ConnectorTransport,
} from "../connectors";
import { callMcpTool, listMcpTools } from "../mcp";
import { requestPromptUse } from "../pendingPrompt";
import { Link, navigate } from "../router";
import { resetSettings, useSettings, writeSettings } from "../settings";
import { addSkill, listSkills, removeSkill, SKILL_NAME_LIMIT, SKILL_PROMPT_LIMIT } from "../skills";
import { SiteFooter, SiteHeader } from "../SiteChrome";
import { Icon } from "../ui/Icon";

function Section({
  id,
  eyebrow,
  title,
  text,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-panel" id={id} aria-labelledby={`${id}-title`}>
      <header className="settings-panel-head">
        <span className="eyebrow eyebrow--cyan">{eyebrow}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{text}</p>
      </header>
      <div className="settings-body">{children}</div>
    </section>
  );
}

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

function AppearanceSection() {
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

function AppSection() {
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

function SkillsSection() {
  const [skills, setSkills] = useState(() => listSkills());
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (): void => {
    try {
      addSkill({ name, prompt });
      setSkills(listSkills());
      setName("");
      setPrompt("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "keyrig cannot save the skill.");
    }
  };

  return (
    <Section
      id="skills"
      eyebrow="Skills"
      title="Saved prompts"
      text="Write a prompt once. Then send it from any chat."
    >
      <div className="field">
        <label htmlFor="skill-name">Name</label>
        <input
          id="skill-name"
          className="input"
          value={name}
          maxLength={SKILL_NAME_LIMIT}
          placeholder="For example: review a pull request"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="skill-prompt">Prompt</label>
        <textarea
          id="skill-prompt"
          className="textarea"
          rows={3}
          value={prompt}
          maxLength={SKILL_PROMPT_LIMIT}
          placeholder="Write the instruction that the chat sends."
          onChange={(event) => setPrompt(event.target.value)}
        />
        <p className="hint">
          {prompt.length} of {SKILL_PROMPT_LIMIT} characters.
        </p>
      </div>

      {error ? <p className="inline-error callout">{error}</p> : null}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={add}>
          <Icon name="plus" size={14} />
          Add the skill
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="settings-empty">No skills yet.</p>
      ) : (
        <ul className="settings-list">
          {skills.map((skill) => (
            <li key={skill.id} className="settings-item">
              <div className="settings-item-main">
                <strong>{skill.name}</strong>
                <p>{skill.prompt}</p>
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    requestPromptUse(skill.prompt);
                    navigate("/app");
                  }}
                >
                  <Icon name="arrow" size={12} />
                  Use in chat
                </button>
                <button
                  type="button"
                  className="btn btn--quiet btn--sm"
                  onClick={() => setSkills(removeSkill(skill.id))}
                >
                  <Icon name="trash" size={12} />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : "keyrig hit an unexpected error.";
}

/** One connector: scan, consent, then a tool run. */
function ConnectorRow({ connector, onChanged }: { connector: Connector; onChanged: () => void }) {
  const [busy, setBusy] = useState<"scan" | "allow" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(connector.allowedTools ?? []);
  const [tool, setTool] = useState(connector.allowedTools?.[0] ?? connector.tools?.[0]?.name ?? "");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null);

  const toggle = (name: string): void => {
    setSelected((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  };

  const scan = async (): Promise<void> => {
    setBusy("scan");
    setError(null);
    try {
      const tools = await listMcpTools(connector);
      setConnectorTools(connector.id, tools);
      setSelected(tools.map((item) => item.name));
      setTool(tools[0]?.name ?? "");
      onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const allow = (): void => {
    setError(null);
    try {
      setConnectorConsent(connector.id, selected);
      onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const revoke = (): void => {
    try {
      revokeConnectorConsent(connector.id);
      setResult(null);
      onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const run = async (): Promise<void> => {
    setBusy("run");
    setError(null);
    try {
      let parsed: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(args);
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("object");
        }
        parsed = value as Record<string, unknown>;
      } catch {
        throw new Error("The arguments must be one JSON object.");
      }
      setResult(await callMcpTool(connector, tool, parsed));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="settings-item settings-item--column">
      <div className="settings-item-head">
        <div className="settings-item-main">
          <strong>{connector.name}</strong>
          <p className="mono">{connector.url}</p>
        </div>
        <div className="settings-item-actions">
          <span className="chip">{connector.transport.toUpperCase()}</span>
          {connector.consentAt ? (
            <span className="chip chip--cyan">
              <Icon name="check" size={10} />
              Allowed
            </span>
          ) : (
            <span className="chip chip--amber">No consent</span>
          )}
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={() => {
              removeConnector(connector.id);
              onChanged();
            }}
          >
            <Icon name="trash" size={12} />
            Remove
          </button>
        </div>
      </div>

      {error ? <p className="inline-error callout">{error}</p> : null}

      {connector.tools === undefined ? (
        <div className="mcp-row">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={() => void scan()}>
            <Icon name="refresh" size={12} />
            {busy === "scan" ? "Asking the server" : "Scan the tools"}
          </button>
          <p className="hint">keyrig reads the tool list. It runs nothing until you allow a tool.</p>
        </div>
      ) : connector.consentAt === undefined ? (
        <div className="mcp-panel">
          <p className="mcp-consent">
            <strong>Allow this server?</strong> It receives the arguments you send and returns text. keyrig sends
            no key. Allow only a server that you trust.
          </p>
          {connector.tools.length === 0 ? (
            <p className="hint">The server listed no tools.</p>
          ) : (
            <ul className="mcp-tools">
              {connector.tools.map((item) => (
                <li key={item.name}>
                  <label className="mcp-tool">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.name)}
                      onChange={() => toggle(item.name)}
                    />
                    <span className="mono">{item.name}</span>
                    <span className="mcp-tool-desc">{item.description}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={selected.length === 0 || busy !== null}
              onClick={allow}
            >
              Allow {selected.length} {selected.length === 1 ? "tool" : "tools"}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={() => void scan()}>
              Scan again
            </button>
          </div>
        </div>
      ) : (
        <div className="mcp-panel">
          <div className="field">
            <label htmlFor={`tool-${connector.id}`}>Tool</label>
            <select
              id={`tool-${connector.id}`}
              className="select mono"
              value={tool}
              onChange={(event) => setTool(event.target.value)}
            >
              {(connector.allowedTools ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`args-${connector.id}`}>Arguments (JSON)</label>
            <textarea
              id={`args-${connector.id}`}
              className="textarea mono"
              rows={2}
              value={args}
              onChange={(event) => setArgs(event.target.value)}
            />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" disabled={busy !== null} onClick={() => void run()}>
              <Icon name="bolt" size={12} />
              {busy === "run" ? "Waiting for the server" : "Run the tool"}
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={revoke}>
              Revoke consent
            </button>
          </div>
          {result ? (
            <pre className={`mcp-result ${result.isError ? "mcp-result--error" : ""}`}>{result.text}</pre>
          ) : null}
        </div>
      )}
    </li>
  );
}

function ConnectorsSection() {
  const [connectors, setConnectors] = useState(() => listConnectors());
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<ConnectorTransport>("http");
  const [error, setError] = useState<string | null>(null);

  const check = checkConnectorUrl(url);
  const ready = name.trim().length > 0 && url.trim().length > 0 && check.allowed;

  const add = (): void => {
    try {
      addConnector({ name, url, transport });
      setConnectors(listConnectors());
      setName("");
      setUrl("");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "keyrig cannot save the connector.");
    }
  };

  return (
    <Section
      id="connectors"
      eyebrow="Connectors"
      title="External tool servers"
      text="keyrig speaks MCP to each server. It scans the tool list, then runs only the tools that you allow."
    >
      <div className="field">
        <label htmlFor="connector-name">Name</label>
        <input
          id="connector-name"
          className="input"
          value={name}
          placeholder="For example: notes server"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="connector-url">Endpoint</label>
          <input
            id="connector-url"
            className="input mono"
            value={url}
            spellCheck={false}
            placeholder="http://127.0.0.1:7000"
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="connector-transport">Transport</label>
          <select
            id="connector-transport"
            className="select"
            value={transport}
            onChange={(event) => setTransport(event.target.value === "sse" ? "sse" : "http")}
          >
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </div>
      </div>

      {url.trim().length > 0 && check.message ? (
        <div className="callout" role={check.allowed ? undefined : "alert"}>
          <strong>{check.allowed ? "Local endpoint." : "Blocked endpoint."}</strong> {check.message}
        </div>
      ) : null}
      {error ? <p className="inline-error callout">{error}</p> : null}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" disabled={!ready} onClick={add}>
          <Icon name="plus" size={14} />
          Add the connector
        </button>
      </div>

      {connectors.length === 0 ? (
        <p className="settings-empty">No connectors yet.</p>
      ) : (
        <ul className="settings-list">
          {connectors.map((connector) => (
            <ConnectorRow key={connector.id} connector={connector} onChanged={() => setConnectors(listConnectors())} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function PluginsSection() {
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

const INDEX = [
  { id: "appearance", label: "Appearance" },
  { id: "app", label: "App" },
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "plugins", label: "Plugins" },
];

export function SettingsPage() {
  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main settings">
        <header className="page-hero settings-hero">
          <span className="eyebrow eyebrow--amber">Settings</span>
          <h1>
            Make it <span className="accent">yours.</span>
          </h1>
          <p className="lead">
            The look, the saved prompts and the provider packs. Everything here stays in this browser.
          </p>
        </header>

        <nav className="settings-index" aria-label="Settings sections">
          {INDEX.map((item) => (
            <a key={item.id} className="settings-index-link" href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="settings-stack">
          <AppearanceSection />
          <AppSection />
          <SkillsSection />
          <ConnectorsSection />
          <PluginsSection />
        </div>

        <p className="settings-foot">
          <Link to="/app" className="text-link">
            Back to the workspace
            <Icon name="arrow" size={13} />
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
