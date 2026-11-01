import { useState } from "react";
import { callMcpTool, listMcpTools } from "../../services/mcp";
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
} from "../../stores/connectors";
import { Icon } from "../../components/ui/Icon";
import { Section } from "./Section";

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

export function ConnectorsSection() {
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
