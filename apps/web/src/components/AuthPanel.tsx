import { useState, type ChangeEvent, type FormEvent } from "react";
import { MAX_VAULT_IMPORT_BYTES, MIN_PASSWORD_LENGTH } from "@keyrig/core";
import { isKeyrigError, toKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import { Icon } from "./ui/Icon";

type Mode = "signup" | "signin" | "import";

interface AuthPanelProps {
  onSignUp: (username: string, password: string) => Promise<void>;
  onSignIn: (username: string, password: string) => Promise<void>;
  onImport: (password: string, file: unknown) => Promise<void>;
}

function messageOf(caught: unknown): string {
  const error: KeyrigErrorJSON = isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
  return error.message;
}

export function AuthPanel({ onSignUp, onSignIn, onImport }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode): void => {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
    setFile(null);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setError(null);
    if (mode === "signup" && password !== confirm) {
      setError("The two passwords are not the same.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "import") {
        if (!file) {
          setError("Choose the vault file.");
          return;
        }
        if (file.size > MAX_VAULT_IMPORT_BYTES) {
          setError("The file is too large to be a keyrig vault.");
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          setError("That file is not a keyrig vault export.");
          return;
        }
        await onImport(password, parsed);
      } else if (mode === "signup") {
        await onSignUp(username, password);
      } else {
        await onSignIn(username, password);
      }
    } catch (caught) {
      setError(messageOf(caught));
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  const isSignUp = mode === "signup";
  const isImport = mode === "import";

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-tabs" role="group" aria-label="Account">
        <button
          type="button"
          className="auth-tab"
          aria-pressed={isSignUp}
          onClick={() => switchMode("signup")}
        >
          Create account
        </button>
        <button
          type="button"
          className="auth-tab"
          aria-pressed={mode === "signin"}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className="auth-tab"
          aria-pressed={isImport}
          onClick={() => switchMode("import")}
        >
          Import vault
        </button>
      </div>

      <div className="auth-head">
        <span className="eyebrow eyebrow--amber">
          {isSignUp ? "New on this device" : isImport ? "Move a vault" : "Welcome back"}
        </span>
        <h2 id="auth-title">
          {isSignUp ? "Create your keyrig account" : isImport ? "Import your key vault" : "Sign in to keyrig"}
        </h2>
        <p>
          {isSignUp
            ? "Your username and password open your own encrypted key vault. The password is never stored."
            : isImport
              ? "Choose the file from another keyrig address. The password of that vault opens it here."
              : "Sign in to unlock your key vault on this device."}
        </p>
        <p className="hint auth-scope">
          An account belongs to this browser and this web address. Another keyrig address, or another browser,
          has its own accounts and keys.
        </p>
      </div>

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        {isImport ? (
          <div className="field">
            <label htmlFor="auth-vault-file">Vault file</label>
            <input
              id="auth-vault-file"
              className="input auth-file"
              type="file"
              accept="application/json,.json"
              onChange={chooseFile}
            />
            <p className="hint">The file ends in .json. keyrig reads it here and sends it nowhere.</p>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              className="input mono"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              placeholder="For example: alice"
              onChange={(event) => setUsername(event.target.value)}
            />
            {isSignUp ? (
              <p className="hint">3 to 32 letters or digits. Dots, dashes and underscores are allowed.</p>
            ) : null}
          </div>
        )}

        <div className="field">
          <label htmlFor="auth-password">{isImport ? "Vault password" : "Password"}</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {isSignUp ? (
            <p className="hint">{MIN_PASSWORD_LENGTH} characters or more.</p>
          ) : isImport ? (
            <p className="hint">Use the password from the address that made the file.</p>
          ) : null}
        </div>

        {isSignUp ? (
          <div className="field">
            <label htmlFor="auth-confirm">Repeat the password</label>
            <input
              id="auth-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <p className="callout" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary btn--block auth-submit" disabled={busy}>
          <Icon name={isSignUp ? "plus" : isImport ? "download" : "unlock"} size={15} />
          {busy
            ? isSignUp
              ? "Creating the vault"
              : isImport
                ? "Opening the vault"
                : "Unlocking the vault"
            : isSignUp
              ? "Create account"
              : isImport
                ? "Import the vault"
                : "Sign in"}
        </button>
      </form>

      <p className="hint hint--mono auth-foot">
        {isSignUp
          ? "KEYRIG CANNOT RECOVER A FORGOTTEN PASSWORD. THE VAULT STAYS ON THIS DEVICE."
          : isImport
            ? "THE FILE IS ENCRYPTED. THE PASSWORD OPENS IT. KEYRIG SENDS IT NOWHERE."
            : "ACCOUNTS AND KEYS STAY ON THIS DEVICE."}
      </p>
    </section>
  );
}
