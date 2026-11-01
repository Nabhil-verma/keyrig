import {
  GITHUB_API_URL,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_SCOPE,
  GITHUB_TOKEN_URL,
  GOOGLE_SCRIPT_URL,
  parseGithubDeviceStart,
  parseGithubToken,
  type GithubDeviceStart,
} from "@keyrig/core";
import { KeyrigError } from "@keyrig/shared";

/**
 * The browser side of the two connections.
 *
 * Both flows use a public client id only, so no keyrig server sits between the
 * browser and Google or GitHub. Google sends an ID token that names a verified
 * Gmail address. GitHub uses the device flow: the user types a short code on
 * github.com, and keyrig receives a token for the account.
 */

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  prompt(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id !== undefined) {
    return Promise.resolve();
  }
  if (scriptPromise !== null) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        KeyrigError.fromCategory("network", {
          code: "google_script_failed",
          message: "keyrig cannot load the Google script. Check the network and try again.",
          action: "check_network",
        }),
      );
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Ask Google for one ID token. The token names a verified address. */
export async function requestGoogleIdToken(clientId: string): Promise<string> {
  if (clientId.trim().length === 0) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "google_client_id_missing",
      message: "Paste the Google client id first.",
      action: "check_settings",
    });
  }
  await loadGoogleScript();
  const api = window.google?.accounts?.id;
  if (api === undefined) {
    throw KeyrigError.fromCategory("network", {
      code: "google_script_failed",
      message: "The Google script did not start. Reload the page and try again.",
      action: "retry",
    });
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(
          KeyrigError.fromCategory("timeout", {
            code: "google_no_answer",
            message: "The Google window did not answer. Try again, and allow pop-ups for keyrig.",
            action: "retry",
          }),
        );
      }
    }, 120_000);

    api.initialize({
      client_id: clientId.trim(),
      ux_mode: "popup",
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        if (typeof response.credential === "string" && response.credential.length > 0) {
          resolve(response.credential);
          return;
        }
        reject(
          KeyrigError.fromCategory("auth", {
            code: "google_no_credential",
            message: "Google sent no address. Try again.",
            action: "retry",
          }),
        );
      },
    });
    api.prompt();
  });
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
  } catch {
    throw KeyrigError.fromCategory("network", {
      code: "github_unreachable",
      message: "keyrig cannot reach GitHub. Check the network, and check that the GitHub app accepts this address.",
      action: "check_network",
    });
  }
  if (!response.ok) {
    throw KeyrigError.fromCategory("network", {
      code: "github_refused_request",
      message: "GitHub refused the request. Check the client id, then try again.",
      action: "check_settings",
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw KeyrigError.fromCategory("server", {
      code: "github_bad_answer",
      message: "GitHub sent an answer that keyrig cannot read. Try again.",
      action: "retry",
    });
  }
}

export async function startGithubDevice(clientId: string): Promise<GithubDeviceStart> {
  if (clientId.trim().length === 0) {
    throw KeyrigError.fromCategory("invalid_request", {
      code: "github_client_id_missing",
      message: "Paste the GitHub client id first.",
      action: "check_settings",
    });
  }
  const body = await postForm(GITHUB_DEVICE_CODE_URL, {
    client_id: clientId.trim(),
    scope: GITHUB_SCOPE,
  });
  return parseGithubDeviceStart(body);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(KeyrigError.fromCategory("cancelled"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Poll GitHub until the user types the code. The token stays in the vault. */
export async function pollGithubToken(input: {
  clientId: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
  signal?: AbortSignal;
}): Promise<string> {
  const deadline = Date.now() + Math.max(60, input.expiresInSeconds) * 1000;
  let wait = Math.max(1, input.intervalSeconds);
  while (Date.now() < deadline) {
    await sleep(wait * 1000, input.signal);
    const body = await postForm(GITHUB_TOKEN_URL, {
      client_id: input.clientId,
      device_code: input.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const parsed = parseGithubToken(body);
    if (parsed.token !== null) {
      return parsed.token;
    }
    if (parsed.error === "slow_down") {
      wait += 5;
      continue;
    }
    if (parsed.error === "authorization_pending") {
      continue;
    }
    if (parsed.error === "expired_token") {
      throw KeyrigError.fromCategory("auth", {
        code: "github_code_expired",
        message: "The GitHub code expired. Start the connection again.",
        action: "retry",
      });
    }
    if (parsed.error === "access_denied") {
      throw KeyrigError.fromCategory("auth", {
        code: "github_denied",
        message: "You cancelled the GitHub connection.",
        action: "none",
      });
    }
    throw KeyrigError.fromCategory("auth", {
      code: "github_flow_failed",
      message: `GitHub sent ${parsed.error ?? "an error"}. Check the client id.`,
      action: "check_settings",
    });
  }
  throw KeyrigError.fromCategory("timeout", {
    code: "github_code_expired",
    message: "The GitHub code expired. Start the connection again.",
    action: "retry",
  });
}

/** The login name of the connected account. It labels the connection. */
export async function readGithubLogin(token: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch {
    throw KeyrigError.fromCategory("network", {
      code: "github_unreachable",
      message: "keyrig cannot reach GitHub. Check the network and try again.",
      action: "check_network",
    });
  }
  if (!response.ok) {
    throw KeyrigError.fromCategory("auth", {
      code: "github_token_invalid",
      message: "GitHub rejected the new token. Connect GitHub again.",
      action: "retry",
    });
  }
  const body = (await response.json()) as { login?: unknown };
  if (typeof body.login !== "string" || body.login.length === 0) {
    throw KeyrigError.fromCategory("server", {
      code: "github_bad_answer",
      message: "GitHub sent no login name. Try again.",
      action: "retry",
    });
  }
  return body.login;
}
