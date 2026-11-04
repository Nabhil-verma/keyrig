import { useCallback, useEffect, useState } from "react";
import { PERMISSION_LABELS, type ToolPermission } from "@keyrig/core";
import { SiteFooter, SiteHeader } from "../app/SiteChrome";
import { Link } from "../app/router";
import { Icon } from "../components/ui/Icon";
import { ToolWarningDialog } from "../components/ToolWarningDialog";
import {
  createBackendClient,
  isBackendOff,
  type PublishedToolRow,
} from "../services/backendClient";
import {
  installProblem,
  marketplacePermissions,
  publishToolProblem,
  publishedFromTool,
} from "../lib/marketplace";
import { getToolRegistry } from "../stores/toolRegistry";

const OK = { acknowledged: true } as const;

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0
    ? caught.message
    : "keyrig cannot finish that action.";
}

function PermissionChips({ permissions }: { permissions: ToolPermission[] }) {
  return (
    <>
      {permissions.map((permission) => (
        <span key={permission} className={`chip ${permission === "none" ? "chip--plain" : "chip--amber"}`}>
          {PERMISSION_LABELS[permission]}
        </span>
      ))}
    </>
  );
}

/**
 * Phase 4: the marketplace.
 *
 * Anyone can read the published tools. A publish needs the shared account.
 * Every install passes the same warning card as a local tool and adds an
 * installed copy that stays off until the person turns it on (AS-01, PR-01).
 * The listing holds the tool code only: no key, no chat, no cost (PR-05).
 */
export function MarketplacePage() {
  const [client] = useState(() => createBackendClient());
  const [status, setStatus] = useState<"loading" | "ready" | "off" | "error">("loading");
  const [tools, setTools] = useState<PublishedToolRow[]>([]);
  const [localTools] = useState(() => getToolRegistry().list());
  const [selectedId, setSelectedId] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<PublishedToolRow | null>(null);
  const [warningError, setWarningError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setStatus("loading");
    setError(null);
    try {
      setTools(await client.listTools());
      setStatus("ready");
    } catch (caught) {
      if (isBackendOff(caught)) {
        setStatus("off");
        return;
      }
      setStatus("error");
      setError(messageOf(caught));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (): Promise<void> => {
    const entry = localTools.find((item) => item.tool.id === selectedId);
    if (entry === undefined) {
      setError("Pick one of your local tools first.");
      return;
    }
    const problem = publishToolProblem(entry.tool);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.publishTool(publishedFromTool(entry.tool, tags.split(",")));
      setNote(`Published ${entry.tool.name}. keyrig sent the tool code only.`);
      setSelectedId("");
      setTags("");
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const askInstall = (entry: PublishedToolRow): void => {
    const problem = installProblem(entry);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setWarningError(null);
    setWarning(entry);
  };

  const install = (entry: PublishedToolRow): void => {
    if (entry.definition === null) {
      setWarningError("This entry has no tool code, so keyrig cannot install it.");
      return;
    }
    try {
      getToolRegistry().importTool(JSON.stringify(entry.definition), OK);
      setWarning(null);
      setNote(`Installed ${entry.name}. It is off until you turn it on in Settings, Tools.`);
    } catch (caught) {
      setWarningError(messageOf(caught));
    }
  };

  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main market-page">
        <header className="page-hero">
          <span className="eyebrow eyebrow--cyan">Marketplace</span>
          <h1>
            Tools from other <span className="accent">rigs.</span>
          </h1>
          <p className="lead">
            A published tool holds its code and its permissions. It holds no key, no chat and no cost.
            An install keeps the warning and starts off.
          </p>
        </header>

        {status === "loading" ? <p className="hint">Reading the marketplace…</p> : null}

        {status === "off" ? (
          <div className="settings-note">
            <strong>The marketplace needs the optional backend.</strong> This site has no database
            binding, so the list is empty. Local tools work in Settings, Tools, and the whole app
            still works offline.
          </div>
        ) : null}

        {status === "error" ? (
          <div className="inline-error callout" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        {note ? (
          <p className="settings-note" role="status">
            {note}
          </p>
        ) : null}

        {error !== null && status !== "error" ? (
          <p className="inline-error callout" role="alert">
            {error}
          </p>
        ) : null}

        {status === "ready" ? (
          tools.length === 0 ? (
            <p className="settings-empty">
              No tool is published yet. A signed-in account can publish the first one below.
            </p>
          ) : (
            <ul className="market-grid">
              {tools.map((entry) => {
                const installRefusal = installProblem(entry);
                return (
                  <li key={entry.id} className="market-card">
                    <header className="market-card-head">
                      <div>
                        <strong>{entry.name}</strong>
                        <span className="hint mono">v{entry.version} · {entry.publisher}</span>
                      </div>
                      <span className="chip chip--plain">{entry.risk}</span>
                    </header>
                    <p>{entry.description}</p>
                    <div className="market-perms">
                      <PermissionChips permissions={marketplacePermissions(entry)} />
                      {entry.tags.map((tag) => (
                        <span key={tag} className="chip chip--cyan">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="market-card-foot">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={installRefusal !== null}
                        title={installRefusal ?? "Install this tool"}
                        onClick={() => askInstall(entry)}
                      >
                        <Icon name="download" size={12} />
                        Install
                      </button>
                      {installRefusal !== null ? <span className="hint">{installRefusal}</span> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        <section className="market-publish" aria-labelledby="publish-title">
          <h2 id="publish-title">Publish one of your tools</h2>
          <p>
            Publishing sends the name, the description, the permissions, the version, the tags and the
            code. It sends no key, no chat and no cost. A published tool is public.
          </p>
          {localTools.length === 0 ? (
            <p className="hint">Add a tool in Settings, Tools first.</p>
          ) : (
            <div className="market-form">
              <div className="field">
                <label htmlFor="market-tool">Local tool</label>
                <select
                  id="market-tool"
                  className="select"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">Pick a tool</option>
                  {localTools.map((entry) => (
                    <option key={entry.tool.id} value={entry.tool.id}>
                      {entry.tool.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="market-tags">Tags (comma separated, up to 8)</label>
                <input
                  id="market-tags"
                  className="input"
                  value={tags}
                  placeholder="text, format"
                  onChange={(event) => setTags(event.target.value)}
                />
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => void publish()}>
                  <Icon name="globe" size={12} />
                  {busy ? "Publishing…" : "Publish the tool"}
                </button>
                <Link to="/settings" className="btn btn--quiet btn--sm">
                  Manage local tools
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />

      <ToolWarningDialog
        request={
          warning === null
            ? null
            : {
                action: "Install a marketplace tool",
                toolName: warning.name,
                permissions: marketplacePermissions(warning),
                confirmLabel: "Install the tool",
                onConfirm: () => install(warning),
              }
        }
        error={warningError}
        onClose={() => {
          setWarning(null);
          setWarningError(null);
        }}
      />
    </div>
  );
}
