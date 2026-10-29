import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@keyrig/core";
import { isKeyrigError, toKeyrigError, type KeyrigErrorJSON } from "@keyrig/shared";
import { Icon } from "./ui/Icon";

type Mode = "signup" | "signin";

interface AuthPanelProps {
  onSignUp: (username: string, password: string) => Promise<void>;
  onSignIn: (username: string, password: string) => Promise<void>;
}

function messageOf(caught: unknown): string {
  const error: KeyrigErrorJSON = isKeyrigError(caught) ? caught.toJSON() : toKeyrigError(caught).toJSON();
  return error.message;
}

export function AuthPanel({ onSignUp, onSignIn }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode): void => {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
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
      if (mode === "signup") {
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
          aria-pressed={!isSignUp}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
      </div>

      <div className="auth-head">
        <span className="eyebrow eyebrow--amber">{isSignUp ? "New on this device" : "Welcome back"}</span>
        <h2 id="auth-title">{isSignUp ? "Create your keyrig account" : "Sign in to keyrig"}</h2>
        <p>
          {isSignUp
            ? "Your username and password open your own encrypted key vault. The password is never stored."
            : "Sign in to unlock your key vault on this device."}
        </p>
      </div>

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
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

        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {isSignUp ? <p className="hint">{MIN_PASSWORD_LENGTH} characters or more.</p> : null}
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
          <Icon name={isSignUp ? "plus" : "unlock"} size={15} />
          {busy ? (isSignUp ? "Creating the vault" : "Unlocking the vault") : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="hint hint--mono auth-foot">
        {isSignUp
          ? "KEYRIG CANNOT RECOVER A FORGOTTEN PASSWORD. THE VAULT STAYS ON THIS DEVICE."
          : "ACCOUNTS AND KEYS STAY ON THIS DEVICE."}
      </p>
    </section>
  );
}
