import { useRef, useState } from "react";
import {
  GITHUB_TOKEN_NAME,
  normalizeRecoveryEmail,
  readGoogleIdToken,
  type KeyVault,
} from "@keyrig/core";
import { KeyrigError, type StorageLike } from "@keyrig/shared";
import { writeConnections, type AccountConnections } from "../stores/connections";
import { pollGithubToken, readGithubLogin, requestGoogleIdToken, startGithubDevice } from "../services/oauth";
import { readOAuthConfig, writeOAuthConfig } from "../stores/oauthConfig";
import { AGENT_RISK_VERSION, writeAgentSettings } from "../stores/toolSettings";
import { Icon } from "./ui/Icon";

/**
 * The profile connections of one account.
 *
 * Google supplies a recovery email only. GitHub supplies an account for a
 * commit, and the switch that allows the AI to commit. The GitHub token lives
 * in the encrypted vault, never in this record.
 */

interface ConnectionsPanelProps {
  vault: KeyVault;
  connections: AccountConnections;
  store: StorageLike;
  onChanged: (next: AccountConnections) => void;
}

const COMMIT_RISKS = [
  "The AI writes a commit to your GitHub repository with your connected account.",
  "A public repository shows the commit to everyone.",
  "A commit stays in the history. It is hard to remove.",
  "Every commit still asks you first. This switch only allows the AI to offer one.",
  "keyrig writes only the files that you approve. It cannot delete a file on GitHub.",
];

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message.length > 0 ? caught.message : "keyrig hit an unexpected error.";
}

export function ConnectionsPanel({ vault, connections, store, onChanged }: ConnectionsPanelProps) {
  const [config, setConfig] = useState(() => readOAuthConfig());
  const [email, setEmail] = useState(connections.recoveryEmail ?? "");
  const [repo, setRepo] = useState(connections.githubRepo);
  const [branch, setBranch] = useState(connections.githubBranch);
  const [busy, setBusy] = useState<"google" | "github" | null>(null);
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const saveConfig = (patch: Partial<typeof config>): void => {
    setConfig(writeOAuthConfig(patch));
  };

  const connectGoogle = async (): Promise<void> => {
    setBusy("google");
    setError(null);
    setNotice(null);
    try {
      const token = await requestGoogleIdToken(config.googleClientId);
      const profile = readGoogleIdToken(token, { clientId: config.googleClientId });
      setEmail(profile.email);
      onChanged(writeConnections(store, { recoveryEmail: profile.email }));
      setNotice(`The recovery email is ${profile.email}.`);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const saveEmail = (): void => {
    setError(null);
    setNotice(null);
    try {
      const value = normalizeRecoveryEmail(email);
      setEmail(value);
      onChanged(writeConnections(store, { recoveryEmail: value }));
      setNotice("keyrig saved the recovery email.");
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const connectGithub = async (): Promise<void> => {
    setBusy("github");
    setError(null);
    setNotice(null);
    setDevice(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const start = await startGithubDevice(config.githubClientId);
      setDevice({ userCode: start.userCode, verificationUri: start.verificationUri });
      const token = await pollGithubToken({
        clientId: config.githubClientId,
        deviceCode: start.deviceCode,
        intervalSeconds: start.interval,
        expiresInSeconds: start.expiresIn,
        signal: controller.signal,
      });
      const login = await readGithubLogin(token);
      await vault.saveInternalSecret(GITHUB_TOKEN_NAME, token);
      onChanged(writeConnections(store, { githubLogin: login }));
      setNotice(`keyrig connected the GitHub account ${login}.`);
    } catch (caught) {
      if (!(caught instanceof KeyrigError && caught.category === "cancelled")) {
        setError(messageOf(caught));
      }
    } finally {
      abortRef.current = null;
      setDevice(null);
      setBusy(null);
    }
  };

  const disconnectGithub = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    await vault.clearInternalSecret(GITHUB_TOKEN_NAME);
    onChanged(writeConnections(store, { githubLogin: null, commitPermit: false }));
    setNotice("keyrig removed the GitHub token from this browser. To revoke it at GitHub, open Settings, then Applications.");
  };

  const saveRepo = (): void => {
    setError(null);
    onChanged(writeConnections(store, { githubRepo: repo, githubBranch: branch }));
  };

  const togglePermit = (): void => {
    setError(null);
    setNotice(null);
    if (connections.commitPermit) {
      onChanged(writeConnections(store, { commitPermit: false }));
      return;
    }
    if (!agree) {
      setError("Read the risks, then mark the box.");
      return;
    }
    writeAgentSettings({ acknowledgedVersion: AGENT_RISK_VERSION });
    onChanged(writeConnections(store, { commitPermit: true, githubRepo: repo, githubBranch: branch }));
  };

  return (
    <section className="panel" aria-labelledby="connections-title">
      <div className="panel-head">
        <div className="panel-title">
          <span className="eyebrow eyebrow--cyan">Connections</span>
          <h2 id="connections-title">Profile</h2>
        </div>
        <span className="chip chip--plain">{connections.githubLogin === null ? "local" : "linked"}</span>
      </div>

      <div className="field">
        <label htmlFor="recovery-email">Recovery email (Gmail only)</label>
        <input
          id="recovery-email"
          className="input"
          type="email"
          value={email}
          spellCheck={false}
          placeholder="you@gmail.com"
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy !== null}
            onClick={() => void connectGoogle()}
          >
            <Icon name="globe" size={12} />
            {busy === "google" ? "Waiting for Google" : "Use Google"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy !== null} onClick={saveEmail}>
            Save
          </button>
        </div>
        <p className="hint">
          keyrig keeps the password as the only sign-in. The address is for recovery and for the profile. Google
          checks the address; keyrig never sees a Google password.
        </p>
      </div>

      <div className="field">
        <label htmlFor="google-client">Google client id</label>
        <input
          id="google-client"
          className="input mono"
          value={config.googleClientId}
          spellCheck={false}
          placeholder="1234.apps.googleusercontent.com"
          onChange={(event) => saveConfig({ googleClientId: event.target.value })}
        />
      </div>

      <hr className="panel-rule" />

      {connections.githubLogin === null ? (
        <>
          <div className="field">
            <label htmlFor="github-client">GitHub client id</label>
            <input
              id="github-client"
              className="input mono"
              value={config.githubClientId}
              spellCheck={false}
              placeholder="Ov23li..."
              onChange={(event) => saveConfig({ githubClientId: event.target.value })}
            />
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy !== null}
              onClick={() => void connectGithub()}
            >
              <Icon name="link" size={12} />
              {busy === "github" ? "Waiting for GitHub" : "Connect GitHub"}
            </button>
            {busy === "github" ? (
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            ) : null}
          </div>
          <p className="hint">
            keyrig asks GitHub for a short code. Type the code on the GitHub page. keyrig then holds a token in the
            encrypted vault. The token can read and write every repository of the account.
          </p>
        </>
      ) : (
        <>
          <div className="settings-note">
            <strong>GitHub.</strong> Connected as {connections.githubLogin}. The token is encrypted in this browser.
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="github-repo">Repository</label>
              <input
                id="github-repo"
                className="input mono"
                value={repo}
                spellCheck={false}
                placeholder="owner/repo"
                onChange={(event) => setRepo(event.target.value)}
                onBlur={saveRepo}
              />
            </div>
            <div className="field">
              <label htmlFor="github-branch">Branch</label>
              <input
                id="github-branch"
                className="input mono"
                value={branch}
                spellCheck={false}
                placeholder="main"
                onChange={(event) => setBranch(event.target.value)}
                onBlur={saveRepo}
              />
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-copy">
              <strong>Allow the AI to commit</strong>
              <p>Off by default. Every commit still asks you, even when this switch is on.</p>
            </div>
            <button
              type="button"
              className="settings-switch"
              aria-pressed={connections.commitPermit}
              onClick={togglePermit}
            >
              <span className="settings-switch-dot" />
              {connections.commitPermit ? "On" : "Off"}
            </button>
          </div>

          {connections.commitPermit ? null : (
            <div className="risk-box">
              <strong>Read this before you turn the switch on.</strong>
              <ul>
                {COMMIT_RISKS.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
              <label className="risk-check">
                <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
                <span>I understand these risks.</span>
              </label>
            </div>
          )}

          <div className="btn-row">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void disconnectGithub()}>
              <Icon name="trash" size={12} />
              Disconnect GitHub
            </button>
          </div>
        </>
      )}

      {device !== null ? (
        <div className="callout callout--cyan" role="status">
          <strong>Code: {device.userCode}</strong>
          <p>
            Open{" "}
            <a className="text-link" href={device.verificationUri} target="_blank" rel="noreferrer">
              {device.verificationUri}
            </a>{" "}
            and type the code. keyrig waits here.
          </p>
        </div>
      ) : null}

      {error !== null ? (
        <p className="callout" role="alert">
          {error}
        </p>
      ) : null}
      {notice !== null ? <p className="hint">{notice}</p> : null}
    </section>
  );
}
