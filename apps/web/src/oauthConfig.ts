/**
 * The two OAuth client ids.
 *
 * keyrig holds no client secret, so the app needs only a public client id for
 * each connection. A build can set the two ids in the environment, and the
 * user can paste them in the profile. The paste wins, because one person may
 * run the app from their own OAuth apps.
 */

export const OAUTH_STORAGE_KEY = "keyrig.oauth.v1";

export interface OAuthConfig {
  googleClientId: string;
  githubClientId: string;
}

const EMPTY: OAuthConfig = { googleClientId: "", githubClientId: "" };

function env(name: string): string {
  const values = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = values?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function fromEnv(): OAuthConfig {
  return {
    googleClientId: env("VITE_GOOGLE_CLIENT_ID"),
    githubClientId: env("VITE_GITHUB_CLIENT_ID"),
  };
}

export function normalizeOAuthConfig(input: unknown): OAuthConfig {
  const source = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    googleClientId: typeof source.googleClientId === "string" ? source.googleClientId.trim() : "",
    githubClientId: typeof source.githubClientId === "string" ? source.githubClientId.trim() : "",
  };
}

export function readOAuthConfig(): OAuthConfig {
  const fallback = fromEnv();
  let parsed: OAuthConfig = EMPTY;
  try {
    const raw = window.localStorage.getItem(OAUTH_STORAGE_KEY);
    parsed = raw ? normalizeOAuthConfig(JSON.parse(raw)) : EMPTY;
  } catch {
    parsed = EMPTY;
  }
  return {
    googleClientId: parsed.googleClientId.length > 0 ? parsed.googleClientId : fallback.googleClientId,
    githubClientId: parsed.githubClientId.length > 0 ? parsed.githubClientId : fallback.githubClientId,
  };
}

export function writeOAuthConfig(patch: Partial<OAuthConfig>): OAuthConfig {
  const next = normalizeOAuthConfig({ ...readOAuthConfig(), ...patch });
  try {
    window.localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A full storage must not stop the profile form.
  }
  return next;
}
