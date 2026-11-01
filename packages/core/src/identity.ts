import { KeyrigError } from "@keyrig/shared";

/**
 * The two connections. keyrig still makes an account with a username and a
 * password. These links are extra:
 * - Google supplies a recovery email address. It never signs in to keyrig.
 * - GitHub supplies an account for a commit. It never signs in to keyrig.
 *
 * Both flows use a client id only. A browser cannot keep a client secret, so
 * keyrig keeps D-04: no keyrig server is in the path. The user creates the two
 * OAuth apps and pastes the client ids (see docs/CONNECTIONS.md).
 *
 * The Google token is checked for issuer, audience, expiry and a verified
 * Gmail address. A browser cannot check the signature without the Google
 * certificates, so keyrig does not treat the token as a sign-in factor. It
 * only names the address, and the password still opens the vault.
 */

export const GMAIL_DOMAINS: readonly string[] = ["gmail.com", "googlemail.com"];
export const GOOGLE_ISSUERS: readonly string[] = ["accounts.google.com", "https://accounts.google.com"];
export const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API_URL = "https://api.github.com";
/** The repo scope gives read and write access to every repository of the account. */
export const GITHUB_SCOPE = "repo";
/** The name of the GitHub token in the encrypted vault. */
export const GITHUB_TOKEN_NAME = "github";

export interface GoogleProfile {
  email: string;
  name: string | null;
}

export interface GithubDeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

function invalid(message: string, code: string): never {
  throw KeyrigError.fromCategory("invalid_request", { code, message, action: "check_settings" });
}

/** The recovery email must be a Gmail address, as the owner asked. */
export function normalizeRecoveryEmail(raw: unknown): string {
  if (typeof raw !== "string") {
    invalid("Type a Gmail address.", "recovery_email_invalid");
  }
  const value = (raw as string).trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) {
    invalid("Use a Gmail address that ends in @gmail.com.", "recovery_email_invalid");
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!GMAIL_DOMAINS.includes(domain)) {
    invalid("Use a Gmail address that ends in @gmail.com. Other domains are not accepted.", "recovery_email_invalid");
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(local)) {
    invalid("The part before @gmail.com is not a valid address.", "recovery_email_invalid");
  }
  return value;
}

function base64UrlToText(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const text = atob(padded + "===".slice((padded.length + 3) % 4));
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

/** Read the claims of a JWT. It does not check the signature. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  if (typeof token !== "string") {
    invalid("The Google token is missing.", "google_token_invalid");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[1] === undefined) {
    invalid("The Google token is not a JWT.", "google_token_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlToText(parts[1]));
  } catch {
    invalid("keyrig cannot read the Google token.", "google_token_invalid");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    invalid("keyrig cannot read the Google token.", "google_token_invalid");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Check the claims that a browser can check: issuer, audience, expiry and a
 * verified Gmail address. The caller stores the address as a recovery email.
 */
export function readGoogleIdToken(
  token: string,
  options: { clientId: string; now?: () => number },
): GoogleProfile {
  const clientId = options.clientId.trim();
  if (clientId.length === 0) {
    invalid("Set the Google client id first.", "google_client_id_missing");
  }
  const claims = decodeJwtPayload(token);

  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.includes(claims.iss)) {
    invalid("The Google token comes from an unknown issuer.", "google_token_invalid");
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.some((item) => item === clientId)) {
    invalid("The Google token belongs to another client id.", "google_token_invalid");
  }
  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    invalid("The Google token has expired. Sign in with Google again.", "google_token_expired");
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    invalid("The Google address is not verified.", "google_token_invalid");
  }
  const email = normalizeRecoveryEmail(claims.email);
  const name = typeof claims.name === "string" && claims.name.trim().length > 0 ? claims.name.trim().slice(0, 80) : null;
  return { email, name };
}

/** Read the device flow answer. GitHub sends snake_case fields. */
export function parseGithubDeviceStart(value: unknown): GithubDeviceStart {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid("GitHub sent no device code.", "github_device_invalid");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string") {
    invalid(`GitHub refused the device code: ${record.error}. Check the GitHub client id.`, "github_device_invalid");
  }
  const deviceCode = record.device_code;
  const userCode = record.user_code;
  const verificationUri = record.verification_uri;
  if (typeof deviceCode !== "string" || typeof userCode !== "string" || typeof verificationUri !== "string") {
    invalid("GitHub sent an incomplete device code.", "github_device_invalid");
  }
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : 900;
  const interval = typeof record.interval === "number" && record.interval > 0 ? record.interval : 5;
  return { deviceCode, userCode, verificationUri, expiresIn, interval };
}

/** The token answer. A pending poll sends an error field and no token. */
export function parseGithubToken(value: unknown): { token: string | null; error: string | null } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { token: null, error: "invalid" };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.access_token === "string" && record.access_token.length > 0) {
    return { token: record.access_token, error: null };
  }
  return { token: null, error: typeof record.error === "string" ? record.error : "invalid" };
}
