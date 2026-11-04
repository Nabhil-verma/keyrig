import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BackendAccount, BackendRole } from "../services/backendClient";
import {
  BackendError,
  createBackendClient,
  isBackendOff,
  isSignedOut,
} from "../services/backendClient";

const ROLES: BackendRole[] = ["owner", "admin", "member", "viewer"];

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0
    ? caught.message
    : "keyrig cannot finish that call.";
}

/**
 * D-07 and Phase 3: the optional shared account.
 *
 * This account is separate from the local vault account. The community
 * password is not the vault passphrase, and the backend stores only the name
 * and the role. No key, chat, cost or streak goes to it (PR-01, PR-05).
 */
export function BackendPanel() {
  const [client] = useState(() => createBackendClient());
  const [mode, setMode] = useState<"loading" | "off" | "signed-out" | "signed-in" | "error">("loading");
  const [account, setAccount] = useState<BackendAccount | null>(null);
  const [accounts, setAccounts] = useState<BackendAccount[]>([]);
  const [formMode, setFormMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const loadRoles = useCallback(
    async (role: BackendRole): Promise<void> => {
      if (role !== "owner" && role !== "admin") {
        setAccounts([]);
        return;
      }
      try {
        setAccounts(await client.listRoles());
      } catch (caught) {
        setRoleError(messageOf(caught));
      }
    },
    [client],
  );

  const load = useCallback(async (): Promise<void> => {
    setMode("loading");
    setError(null);
    try {
      const me = await client.me();
      setAccount(me);
      setMode("signed-in");
      await loadRoles(me.role);
    } catch (caught) {
      if (isBackendOff(caught)) {
        setMode("off");
        return;
      }
      if (isSignedOut(caught)) {
        setMode("signed-out");
        return;
      }
      setMode("error");
      setError(messageOf(caught));
    }
  }, [client, loadRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        formMode === "sign-up"
          ? await client.signUp(username, password)
          : await client.signIn(username, password);
      setAccount(next);
      setMode("signed-in");
      setPassword("");
      await loadRoles(next.role);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await client.signOut();
      setAccount(null);
      setAccounts([]);
      setMode("signed-out");
    } catch (caught) {
      if (caught instanceof BackendError && caught.status === 401) {
        setAccount(null);
        setAccounts([]);
        setMode("signed-out");
      } else {
        setError(messageOf(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (target: string, role: BackendRole): Promise<void> => {
    setRoleError(null);
    try {
      await client.setRole(target, role);
      await loadRoles(account?.role ?? "viewer");
    } catch (caught) {
      setRoleError(messageOf(caught));
    }
  };

  return (
    <div className="backend-panel">
      <div className="settings-row">
        <div className="settings-row-copy">
          <strong>The shared account (optional)</strong>
          <p>
            The backend keeps the account name and the role for the marketplace and the feature
            requests. It never receives a key, a chat, a cost or a streak.
          </p>
        </div>
        {mode === "signed-in" && account !== null ? (
          <span className="chip chip--cyan">{account.role}</span>
        ) : null}
      </div>

      {mode === "loading" ? <p className="hint">Checking the backend…</p> : null}

      {mode === "off" ? (
        <p className="settings-note">
          <strong>The backend is off on this site.</strong> keyrig works without it. The marketplace
          and the shared requests need the backend, and this device keeps its own copy.
        </p>
      ) : null}

      {mode === "error" ? (
        <div className="inline-error callout" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {mode === "signed-out" ? (
        <form className="backend-form" onSubmit={(event) => void submit(event)}>
          <div className="segmented" role="group" aria-label="Shared account">
            <button
              type="button"
              className="segmented-item"
              aria-pressed={formMode === "sign-up"}
              onClick={() => setFormMode("sign-up")}
            >
              Create the shared account
            </button>
            <button
              type="button"
              className="segmented-item"
              aria-pressed={formMode === "sign-in"}
              onClick={() => setFormMode("sign-in")}
            >
              Sign in
            </button>
          </div>
          <div className="field">
            <label htmlFor="backend-username">Account name</label>
            <input
              id="backend-username"
              className="input"
              value={username}
              autoComplete="username"
              maxLength={32}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="backend-password">Community password</label>
            <input
              id="backend-password"
              className="input"
              type="password"
              value={password}
              autoComplete={formMode === "sign-up" ? "new-password" : "current-password"}
              maxLength={200}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="hint">
              Use a password that is not your vault passphrase. keyrig stores only a salt and a hash.
            </p>
          </div>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="btn-row">
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              {busy ? "Working…" : formMode === "sign-up" ? "Create the account" : "Sign in"}
            </button>
          </div>
        </form>
      ) : null}

      {mode === "signed-in" && account !== null ? (
        <div className="backend-signed">
          <p>
            Signed in as <strong>{account.username}</strong>. The shared account stores only this
            name and the role.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out of the backend
            </button>
          </div>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}

          {account.role === "owner" || account.role === "admin" ? (
            <div className="backend-roles">
              <strong>Roles on the shared site</strong>
              <ul className="settings-list">
                {accounts.map((row) => (
                  <li key={row.username} className="settings-item">
                    <div className="settings-item-main">
                      <strong>{row.username}</strong>
                      <p>{row.username === account.username ? "That is you." : "One account on the site."}</p>
                    </div>
                    <div className="settings-item-actions">
                      <select
                        className="select"
                        aria-label={`Role of ${row.username}`}
                        value={row.role}
                        disabled={row.username === account.username}
                        onChange={(event) => void changeRole(row.username, event.target.value as BackendRole)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
              {roleError ? (
                <p className="inline-error" role="alert">
                  {roleError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
