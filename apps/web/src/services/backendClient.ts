import { backendRequest, holdsKey } from "@keyrig/shared";

/**
 * D-07: the client of the optional backend.
 *
 * The backend holds accounts, roles, the marketplace and feature requests. It
 * never receives a key, a chat, a cost, usage data or a streak. Every request
 * body passes `backendRequest`, so the four allowed fields are the only fields
 * that leave this browser (PR-01, PR-05).
 *
 * Local mode does not need this module.
 */

export type BackendRole = "owner" | "admin" | "member" | "viewer";
export type RequestStatus = "open" | "planned" | "done" | "declined";

export interface BackendAccount {
  username: string;
  role: BackendRole;
}

export interface BackendToolDefinition {
  name: string;
  description: string;
  permissions: string[];
  inputSchema: Record<string, unknown>;
  script: string;
}

export interface PublishedToolRow {
  id: string;
  name: string;
  publisher: string;
  risk: string;
  description: string;
  permissions: string[];
  version: number;
  tags: string[];
  definition: BackendToolDefinition | null;
  createdAt: string | null;
}

export interface FeatureRequestRow {
  id: string;
  username: string;
  title: string;
  detail: string;
  status: RequestStatus;
  statusReason: string;
  votes: number;
  voted: boolean;
  createdAt: string;
}

export interface PublishToolInput {
  name: string;
  description: string;
  permissions: string[];
  version: number;
  tags: string[];
  definition: BackendToolDefinition;
}

/** A call that the backend refused, with the status and the code that it sent. */
export class BackendError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.code = code;
  }
}

/** D-07: the site has no database binding, so the backend is off. */
export function isBackendOff(error: unknown): boolean {
  return error instanceof BackendError && (error.status === 503 || error.code === "no_database");
}

export function isSignedOut(error: unknown): boolean {
  return error instanceof BackendError && error.status === 401;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function accountBody(username: string, password: string): { username: string; password: string } {
  if (holdsKey(password)) {
    throw new BackendError(
      400,
      "key_in_body",
      "keyrig will not send a value that looks like a provider key. Use a different password.",
    );
  }
  const account = backendRequest({ account: { username: username.trim(), password } }).account as
    | { username: string; password: string }
    | undefined;
  if (account === undefined) {
    throw new BackendError(400, "account_invalid", "keyrig cannot send that account name.");
  }
  return account;
}

export function createBackendClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
) {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        credentials: "same-origin",
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      });
    } catch {
      throw new BackendError(
        0,
        "network_offline",
        "keyrig cannot reach the backend. Check the network and try again.",
      );
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const failure = (body as { error?: { message?: string; code?: string } } | null)?.error;
      throw new BackendError(
        response.status,
        failure?.code ?? "backend_error",
        failure?.message ?? "The backend refused this call.",
      );
    }
    // A static host with no backend answers the page, not the API. Read that
    // answer as an absent backend, so a page shows its offline state (D-07).
    if (body === null || typeof body !== "object") {
      throw new BackendError(503, "no_backend", "The backend is off on this site.");
    }
    return body as T;
  };

  const post = <T>(path: string, body: unknown): Promise<T> =>
    call<T>(path, { method: "POST", body: JSON.stringify(body) });

  return {
    me: async (): Promise<BackendAccount> => (await call<{ account: BackendAccount }>("/api/backend/account")).account,

    signUp: async (username: string, password: string): Promise<BackendAccount> =>
      (await post<{ account: BackendAccount }>("/api/backend/account?mode=sign-up", {
        account: accountBody(username, password),
      })).account,

    signIn: async (username: string, password: string): Promise<BackendAccount> =>
      (await post<{ account: BackendAccount }>("/api/backend/account?mode=sign-in", {
        account: accountBody(username, password),
      })).account,

    signOut: async (): Promise<void> => {
      await post<{ ok: boolean }>("/api/backend/sign-out", {});
    },

    listRoles: async (): Promise<BackendAccount[]> =>
      (await call<{ accounts: BackendAccount[] }>("/api/backend/roles")).accounts,

    setRole: async (username: string, role: BackendRole): Promise<BackendAccount> =>
      (await post<{ account: BackendAccount }>("/api/backend/roles", {
        account: { username, role },
      })).account,

    listTools: async (): Promise<PublishedToolRow[]> =>
      (await call<{ tools: PublishedToolRow[] }>("/api/backend/tools")).tools,

    publishTool: async (input: PublishToolInput): Promise<PublishedToolRow> =>
      (await post<{ tool: PublishedToolRow }>("/api/backend/tools", { publishedTools: input })).tool,

    listRequests: async (): Promise<FeatureRequestRow[]> =>
      (await call<{ featureRequests: FeatureRequestRow[] }>("/api/backend/requests")).featureRequests,

    submitRequest: async (title: string, detail: string): Promise<{ id: string }> =>
      (await post<{ featureRequest: { id: string } }>("/api/backend/requests", {
        featureRequests: { title, detail },
      })).featureRequest,

    voteRequest: async (requestId: string, up: boolean): Promise<void> => {
      await post<{ votes: { requestId: string; up: boolean } }>("/api/backend/request-votes", {
        votes: { requestId, up },
      });
    },

    setRequestStatus: async (
      requestId: string,
      status: RequestStatus,
      reason: string,
    ): Promise<void> => {
      await post<{ featureRequest: { id: string; status: string } }>("/api/backend/request-status", {
        featureRequests: { id: requestId, status, reason },
      });
    },
  };
}
