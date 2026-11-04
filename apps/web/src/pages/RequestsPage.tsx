import { useCallback, useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "../app/SiteChrome";
import { Link } from "../app/router";
import { Icon } from "../components/ui/Icon";
import {
  createBackendClient,
  isBackendOff,
  isSignedOut,
  type BackendAccount,
  type FeatureRequestRow,
  type RequestStatus,
} from "../services/backendClient";
import { browserStorage } from "../lib/storage";
import {
  addLocalRequest,
  readLocalRequests,
  setLocalRequestStatus,
  voteLocalRequest,
} from "../stores/featureRequests";

const STATUSES: RequestStatus[] = ["open", "planned", "done", "declined"];

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0
    ? caught.message
    : "keyrig cannot finish that action.";
}

function localRows(): FeatureRequestRow[] {
  return readLocalRequests(browserStorage()).map((request) => ({
    id: request.id,
    username: "this device",
    title: request.title,
    detail: request.detail,
    status: request.status,
    statusReason: request.statusReason,
    votes: request.votes,
    voted: request.voted,
    createdAt: request.createdAt,
  }));
}

/**
 * Phase 5: feature requests.
 *
 * With the backend the list is shared and a vote needs the shared account.
 * Without it the page keeps a local copy, so the product still works offline
 * (D-07). The record holds no key, chat, cost or streak (PR-05).
 */
export function RequestsPage() {
  const [client] = useState(() => createBackendClient());
  const [mode, setMode] = useState<"loading" | "remote" | "local" | "error">("loading");
  const [rows, setRows] = useState<FeatureRequestRow[]>([]);
  const [me, setMe] = useState<BackendAccount | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    setMode("loading");
    setError(null);
    try {
      const list = await client.listRequests();
      setRows(list);
      setMode("remote");
      const account = await client.me().catch((caught: unknown) => {
        if (isSignedOut(caught)) {
          return null;
        }
        throw caught;
      });
      setMe(account);
    } catch (caught) {
      if (isBackendOff(caught)) {
        setRows(localRows());
        setMode("local");
        return;
      }
      setMode("error");
      setError(messageOf(caught));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (): Promise<void> => {
    setError(null);
    setNote(null);
    if (mode === "local") {
      try {
        addLocalRequest(browserStorage(), title, detail);
        setRows(localRows());
        setTitle("");
        setDetail("");
        setNote("Saved on this device. The backend is off, so the request stays here.");
      } catch (caught) {
        setError(messageOf(caught));
      }
      return;
    }
    if (me === null) {
      setError("Sign in with the shared account in Settings, Profile to send a request.");
      return;
    }
    setBusy(true);
    try {
      await client.submitRequest(title, detail);
      setTitle("");
      setDetail("");
      setNote("The request is on the shared site.");
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id: string): Promise<void> => {
    setError(null);
    if (mode === "local") {
      const next = voteLocalRequest(browserStorage(), id).find((request) => request.id === id);
      if (next !== undefined) {
        setRows((current) =>
          current.map((row) =>
            row.id === id ? { ...row, votes: next.votes, voted: next.voted } : row,
          ),
        );
      }
      return;
    }
    if (me === null) {
      setError("Sign in with the shared account in Settings, Profile to vote.");
      return;
    }
    try {
      await client.voteRequest(id, true);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const changeStatus = async (id: string, status: RequestStatus): Promise<void> => {
    if (mode === "remote") {
      try {
        await client.setRequestStatus(id, status, reasons[id] ?? "");
        await load();
      } catch (caught) {
        setError(messageOf(caught));
      }
      return;
    }
    setRows(
      localRows().map((row) => {
        if (row.id !== id) {
          return row;
        }
        const next = setLocalRequestStatus(browserStorage(), id, status, reasons[id] ?? "");
        const found = next.find((request) => request.id === id);
        return found === undefined ? row : { ...row, status: found.status, statusReason: found.statusReason };
      }),
    );
  };

  const canModerate = mode === "remote" && (me?.role === "owner" || me?.role === "admin");

  return (
    <div className="site">
      <SiteHeader />
      <main className="page-main requests-page">
        <header className="page-hero">
          <span className="eyebrow eyebrow--amber">Feature requests</span>
          <h1>
            Ask for the next <span className="accent">part.</span>
          </h1>
          <p className="lead">
            One title, one detail, one vote. keyrig sends no key, chat, cost or streak with a request
            (PR-05).
          </p>
        </header>

        {mode === "loading" ? <p className="hint">Reading the requests…</p> : null}

        {mode === "local" ? (
          <div className="settings-note">
            <strong>The backend is off on this site.</strong> This list stays on this device. Turn on
            the backend in Settings, Profile to share the requests and the votes.
          </div>
        ) : null}

        {mode === "error" ? (
          <div className="inline-error callout" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : null}

        {error !== null && mode !== "error" ? (
          <p className="inline-error callout" role="alert">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="settings-note" role="status">
            {note}
          </p>
        ) : null}

        <section className="request-form" aria-labelledby="request-form-title">
          <h2 id="request-form-title">Send one request</h2>
          {mode === "remote" && me === null ? (
            <p className="hint">
              <Link to="/settings" className="text-link">
                Sign in with the shared account
              </Link>{" "}
              to send a request or vote.
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="request-title">Title</label>
            <input
              id="request-title"
              className="input"
              maxLength={200}
              value={title}
              placeholder="Example: Export the week cost as CSV"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="request-detail">Detail (optional)</label>
            <textarea
              id="request-detail"
              className="textarea"
              rows={3}
              maxLength={2000}
              value={detail}
              placeholder="What should it do?"
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy || title.trim().length < 3}
              onClick={() => void submit()}
            >
              <Icon name="send" size={12} />
              {busy ? "Sending…" : "Send the request"}
            </button>
          </div>
        </section>

        {rows.length === 0 && mode !== "loading" ? (
          <p className="settings-empty">No request yet. The first one is yours.</p>
        ) : (
          <ul className="request-list">
            {rows.map((row) => (
              <li key={row.id} className="request-card">
                <button
                  type="button"
                  className="request-vote"
                  aria-pressed={row.voted}
                  aria-label={`Vote for ${row.title}`}
                  onClick={() => void vote(row.id)}
                >
                  <Icon name="chevron" size={13} />
                  <span>{row.votes}</span>
                </button>
                <div className="request-main">
                  <div className="request-head">
                    <strong>{row.title}</strong>
                    <span className={`chip ${row.status === "open" ? "chip--plain" : "chip--cyan"}`}>
                      {row.status}
                    </span>
                  </div>
                  {row.detail.length > 0 ? <p>{row.detail}</p> : null}
                  <span className="hint mono">
                    {row.username} · {new Date(row.createdAt).toLocaleDateString()}
                    {row.statusReason.length > 0 ? ` · ${row.statusReason}` : ""}
                  </span>

                  {canModerate ? (
                    <div className="request-moderate">
                      <select
                        className="select"
                        aria-label={`Status of ${row.title}`}
                        value={row.status}
                        onChange={(event) => void changeStatus(row.id, event.target.value as RequestStatus)}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        aria-label={`Reason for ${row.title}`}
                        placeholder="Reason (optional)"
                        maxLength={400}
                        value={reasons[row.id] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
