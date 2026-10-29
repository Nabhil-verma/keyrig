import { useState } from "react";
import { isKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import { createVaultExport, type KeyVault, type KeyView } from "@keyrig/core";
import type { ProviderManifest } from "@keyrig/providers";
import { Icon } from "./ui/Icon";

interface KeyPanelProps {
  vault: KeyVault;
  username: string;
  keys: KeyView[];
  manifests: readonly ProviderManifest[];
  onChanged: () => void;
  /** AC-01: the keys.manage permission key. */
  canManage: boolean;
}

function safeError(error: unknown): KeyrigErrorJSON {
  if (isKeyrigError(error)) {
    return error.toJSON();
  }
  return {
    code: "unknown",
    category: "server",
    message: "keyrig hit an unexpected error. Try again.",
    retryable: true,
    remediation: { action: "retry" },
    details: {},
  };
}

function dateText(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function KeyPanel({ vault, username, keys, manifests, onChanged, canManage }: KeyPanelProps) {
  const [error, setError] = useState<KeyrigErrorJSON | null>(null);
  const [busy, setBusy] = useState(false);
  /** The vault folds away, so the route and the chat keep the screen. */
  const [open, setOpen] = useState(true);

  const [label, setLabel] = useState("");
  const [providerId, setProviderId] = useState(manifests[0]?.id ?? "openai");
  const [secret, setSecret] = useState("");
  const [reveal, setReveal] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [replacing, setReplacing] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");

  const run = async (task: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await task();
      onChanged();
    } catch (caught) {
      setError(safeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const addKey = (): Promise<void> =>
    run(async () => {
      await vault.addKey({
        label,
        providerId,
        secret,
        ...(projectId.trim().length > 0 ? { projectId: projectId.trim() } : {}),
      });
      setLabel("");
      setSecret("");
      setProjectId("");
      setReveal(false);
    });

  const saveReplacement = (id: string): Promise<void> =>
    run(async () => {
      await vault.replaceSecret(id, replacement);
      setReplacing(null);
      setReplacement("");
    });

  /** The file is the encrypted vault. It never holds a plain key. */
  const exportVault = (): void => {
    try {
      const file = createVaultExport({ username, vault });
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `keyrig-vault-${username}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (caught) {
      setError(safeError(caught));
    }
  };

  return (
    <section className="panel" aria-labelledby="vault-title">
      <div className="panel-head">
        <div className="panel-title">
          <span className="eyebrow eyebrow--amber">Key vault</span>
          <h2 id="vault-title">Your keys</h2>
        </div>
        <div className="panel-head-actions">
          <span className="state-pill" data-state="unlocked">
            UNLOCKED
          </span>
          <button
            type="button"
            className="vault-toggle"
            aria-expanded={open}
            aria-controls="vault-body"
            title={open ? "Close the key vault" : "Open the key vault"}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="chevron" size={14} />
          </button>
        </div>
      </div>

      <div id="vault-body" hidden={!open}>
      {keys.length === 0 ? (
        <p className="key-empty">No keys yet. Add your first key below.</p>
      ) : (
        <ul className="key-list">
          {keys.map((key) => {
            const manifest = manifests.find((item) => item.id === key.providerId);
            return (
              <li key={key.id} className="key-card">
                <div className="key-card-top">
                  <span className="key-glyph">
                    <Icon name="key" size={15} />
                  </span>
                  <div className="key-id">
                    <div className="key-name">
                      <strong>{key.label}</strong>
                      <span className="key-mask">&bull;&bull;&bull;&bull;&bull;&bull; {key.last4}</span>
                    </div>
                    <div className="key-provider">{manifest?.displayName ?? key.providerId}</div>
                  </div>
                </div>
                <div className="key-meta">
                  <span>Added {dateText(key.createdAt)}</span>
                  <span>{key.lastUsedAt ? `Used ${new Date(key.lastUsedAt).toLocaleTimeString()}` : "Not used yet"}</span>
                  {key.projectId ? <span>Project {key.projectId}</span> : null}
                </div>
                <div className="key-actions">
                  <button
                    type="button"
                    className="btn btn--quiet btn--sm"
                    disabled={!canManage}
                    onClick={() => {
                      setReplacing(replacing === key.id ? null : key.id);
                      setReplacement("");
                    }}
                  >
                    <Icon name="refresh" size={12} />
                    Replace
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--sm"
                    disabled={!canManage}
                    onClick={() => {
                      if (!canManage) {
                        return;
                      }
                      if (!window.confirm(`Delete the key ${key.label}? Chats that use this key stop.`)) {
                        return;
                      }
                      void run(async () => {
                        await vault.deleteKey(key.id);
                      });
                    }}
                  >
                    <Icon name="trash" size={12} />
                    Delete
                  </button>
                </div>
                {replacing === key.id ? (
                  <div className="key-replace">
                    <input
                      className="input"
                      type="password"
                      autoComplete="off"
                      placeholder="Paste the new key"
                      aria-label="New key"
                      value={replacement}
                      onChange={(event) => setReplacement(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busy || !canManage}
                      onClick={() => saveReplacement(key.id)}
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="vault-backup">
        <button type="button" className="btn btn--quiet btn--sm" onClick={exportVault}>
          <Icon name="download" size={13} />
          Export the vault
        </button>
        <p className="hint">The file holds the encrypted vault. Keep the password safe.</p>
      </div>

      <div className="add-key">
        <div className="add-key-head">
          <h3>Add a key</h3>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="key-label">Label</label>
            <input
              id="key-label"
              className="input"
              disabled={!canManage}
              value={label}
              placeholder="For example: work"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="key-provider">Provider</label>
            <select
              id="key-provider"
              className="select"
              disabled={!canManage}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              {manifests.map((manifest) => (
                <option key={manifest.id} value={manifest.id}>
                  {manifest.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="key-secret">Key</label>
          <div className="field-with-action">
            <input
              id="key-secret"
              className="input"
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              disabled={!canManage}
              value={secret}
              placeholder="Paste the provider key"
              onChange={(event) => setSecret(event.target.value)}
            />
            <button
              type="button"
              className="field-action"
              disabled={!canManage}
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Hide the key" : "Show the key"}
            >
              {reveal ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="key-project">Project (optional)</label>
          <input              id="key-project"
              className="input"
              disabled={!canManage}
              value={projectId}
            placeholder="Bind the key to a project"
            onChange={(event) => setProjectId(event.target.value)}
          />
        </div>

        {error ? <p className="inline-error callout">{error.message}</p> : null}
        {!canManage ? (
          <p className="hint">Your role cannot change keys. Ask an owner to change your role.</p>
        ) : null}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={busy || !canManage}
            onClick={addKey}
          >
            <Icon name="plus" size={15} />
            Save the key
          </button>
        </div>
        <p className="hint hint--mono">ENCRYPTED WITH AES-GCM BEFORE THE SAVE.</p>
      </div>
      </div>

      {open ? null : (
        <p className="vault-summary">
          {keys.length === 0
            ? "No keys on this device."
            : `${keys.length} ${keys.length === 1 ? "key" : "keys"} on this device.`}
        </p>
      )}
    </section>
  );
}
