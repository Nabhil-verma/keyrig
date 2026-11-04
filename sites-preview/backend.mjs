// D-07: the optional backend. It holds accounts, roles, the marketplace and
// feature requests. Local mode does not call it, and a site without a database
// binding refuses every call, so the route set can ship switched off.
//
// PR-01: no key reaches a row. Every body passes the field allowlist and the
// key scan, and a published tool is scanned again on its own. The scan in
// `packages/shared/src/publish.ts` is the early check that the person sees; the
// check here is the boundary, because a server cannot trust a browser.
//
// PR-05: a chat, a prompt, cost data, usage data and a streak have no field and
// no table in this file, so a request cannot carry one.
//
// This file holds the rules and the routes. The statements are behind a store,
// so node tests the routes with an in-memory store and the Worker passes D1.
import { COOKIE_MAX_AGE, issueSession, readCookie, readSession, safeEqual } from "./hosted.mjs";

export const BACKEND_COOKIE = "keyrig_backend";
export const BACKEND_FIELDS = Object.freeze(["account", "publishedTools", "featureRequests", "votes"]);
export const MAX_BODY_CHARS = 20_000;
export const MAX_ACCOUNT_NAME = 32;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
export const MAX_TOOL_NAME = 80;
export const MAX_DESCRIPTION = 2_000;
export const MAX_TITLE = 200;
export const MAX_TOOL_ROWS = 100;
export const PBKDF2_ITERATIONS = 100_000;
export const RISK_LEVELS = Object.freeze(["read", "write", "destructive", "external-write"]);
export const ROLE_IDS = Object.freeze(["owner", "admin", "member", "viewer"]);
export const ROLE_RANK = Object.freeze({ owner: 3, admin: 2, member: 1, viewer: 0 });

const NOT_SET_UP = "The keyrig backend is not set up on this site.";
const SIGN_IN_FIRST = "Sign in to use the keyrig backend.";
const ACCOUNT_NAME = /^[A-Za-z0-9._-]{3,32}$/;

/** The same shapes as `packages/shared/src/redact.ts` (KS-03). Keep in step. */
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-proj-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /hf_[A-Za-z0-9]{30,}/g,
  /(?<=Bearer\s)[A-Za-z0-9._~+/-]{8,}=*/g,
  /(?<=[?&](?:api_key|apikey|key|token|access_token)=)[^&\s#]+/gi,
  /(?<=(?:x-api-key|x-goog-api-key)["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{8,}/gi,
];

const SECRET_NAMES =
  /^(authorization|api[-_]?key|apikey|key|token|access[-_]?token|secret|password|passphrase|x-api-key)$/i;

/** True when the text holds a key-like string. */
export function holdsKey(text) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * The path of the first key-like value or key-like field name, or null.
 *
 * `allowed` names the field paths whose name is not a secret. The account
 * password is the one case: it travels to the sign-in route, and the value is
 * still scanned for a key-like string.
 */
export function findSecret(value, path = "", seen = new WeakSet(), allowed = null) {
  if (typeof value === "string") {
    return holdsKey(value) ? path : null;
  }
  if (value === null || typeof value !== "object") {
    return null;
  }
  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findSecret(item, `${path}[${index}]`, seen, allowed);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    const child = path.length === 0 ? key : `${path}.${key}`;
    if (SECRET_NAMES.test(key) && (allowed === null || !allowed.has(child))) {
      return child;
    }
    const found = findSecret(item, child, seen, allowed);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/**
 * The field allowlist. It runs before any route reads the body, so an unknown
 * field is refused instead of ignored.
 */
export function envelopeProblem(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, code: "invalid_body", message: "The request body is not an object." };
  }
  for (const key of Object.keys(body)) {
    if (!BACKEND_FIELDS.includes(key)) {
      return {
        status: 400,
        code: "field_not_allowed",
        message: `${key} is not a field that keyrig stores. The backend takes only ${BACKEND_FIELDS.join(", ")}.`,
      };
    }
  }
  // The password is sent on purpose to the sign-in route. Every other field
  // name and every value is scanned, so a key still refuses the request.
  const allowed = new Set(["account.password"]);
  for (const [field, value] of Object.entries(body)) {
    const found = findSecret(value, field, new WeakSet(), allowed);
    if (found !== null) {
      return {
        status: 400,
        code: "key_in_body",
        message: `The request holds a key (${found}). keyrig stores no key.`,
      };
    }
  }
  return null;
}

/** The reason to refuse an account body, or null. */
export function accountProblem(account) {
  if (account === null || typeof account !== "object" || Array.isArray(account)) {
    return "An account must be one object with a name and a password.";
  }
  const name = typeof account.username === "string" ? account.username.trim() : "";
  if (!ACCOUNT_NAME.test(name)) {
    return `A name uses 3 to ${MAX_ACCOUNT_NAME} letters, digits, dots, dashes or underscores.`;
  }
  if (typeof account.password !== "string") {
    return "An account needs a password.";
  }
  if (account.password.length < MIN_PASSWORD) {
    return `A password needs at least ${MIN_PASSWORD} characters.`;
  }
  if (account.password.length > MAX_PASSWORD) {
    return `A password is longer than ${MAX_PASSWORD} characters.`;
  }
  return null;
}

/** PR-01: the reason to refuse a published tool, or null. */
export function toolProblem(tool) {
  if (tool === null || typeof tool !== "object" || Array.isArray(tool)) {
    return "A published tool must be one object.";
  }
  const name = typeof tool.name === "string" ? tool.name.trim() : "";
  if (name.length === 0) {
    return "Give the tool a name.";
  }
  if (name.length > MAX_TOOL_NAME) {
    return `The tool name is longer than ${MAX_TOOL_NAME} characters.`;
  }
  if (!RISK_LEVELS.includes(tool.risk)) {
    return `The tool needs one risk level: ${RISK_LEVELS.join(", ")}.`;
  }
  const description = typeof tool.description === "string" ? tool.description.trim() : "";
  if (description.length === 0) {
    return "Describe the tool in one sentence.";
  }
  if (description.length > MAX_DESCRIPTION) {
    return `The description is longer than ${MAX_DESCRIPTION} characters.`;
  }
  const found = findSecret(tool, "");
  if (found !== null) {
    return found.length === 0
      ? "keyrig will not publish a key. Publish a tool, not a credential."
      : `keyrig will not publish a tool that holds a key (${found}).`;
  }
  return null;
}

/** The reason to refuse a feature request, or null. */
export function requestProblem(item) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return "A feature request must be one object.";
  }
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (title.length === 0) {
    return "Give the request a title.";
  }
  if (title.length > MAX_TITLE) {
    return `The title is longer than ${MAX_TITLE} characters.`;
  }
  if (item.detail !== undefined && typeof item.detail !== "string") {
    return "The detail must be text.";
  }
  if (typeof item.detail === "string" && item.detail.length > MAX_DESCRIPTION) {
    return `The detail is longer than ${MAX_DESCRIPTION} characters.`;
  }
  return null;
}

/** The reason to refuse a vote, or null. */
export function voteProblem(vote) {
  if (vote === null || typeof vote !== "object" || Array.isArray(vote)) {
    return "A vote must be one object.";
  }
  if (typeof vote.toolId !== "string" || vote.toolId.length === 0) {
    return "A vote names one tool.";
  }
  if (typeof vote.up !== "boolean") {
    return "A vote is up or down.";
  }
  return null;
}

/** AC-04 and AC-05, on the server: the reason to refuse a role change, or null. */
export function roleProblem({ actor, target, actorRole, targetRole, wanted, ownerCount }) {
  if (!ROLE_IDS.includes(wanted)) {
    return "That role does not exist.";
  }
  if (!ROLE_IDS.includes(actorRole)) {
    return "Your role cannot change roles.";
  }
  if (actor === target) {
    return "You cannot change your own role.";
  }
  if (actorRole !== "owner" && actorRole !== "admin") {
    return "Your role cannot change roles. Ask an owner to change your role.";
  }
  if (wanted === "owner" && actorRole !== "owner") {
    return "Only an owner can grant the owner role.";
  }
  if (actorRole !== "owner" && ROLE_RANK[wanted] >= ROLE_RANK[actorRole]) {
    return "You cannot grant a role at or above your own.";
  }
  if (targetRole === "owner" && wanted !== "owner" && ownerCount <= 1) {
    return "The last owner keeps the owner role.";
  }
  return null;
}

function hex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** PBKDF2-SHA-256. The row holds the salt and the hash, never the password. */
export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string" || typeof password !== "string") {
    return false;
  }
  const [saltText, hashText] = stored.split(":");
  if (!saltText || !hashText) {
    return false;
  }
  const salt = Uint8Array.from(saltText.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  const expected = await hashPassword(password, salt);
  return safeEqual(expected, stored);
}

export function backendCookie(value) {
  return `${BACKEND_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function saltOf(env) {
  return env.BACKEND_SESSION_SALT ?? env.HOSTED_IP_SALT ?? "keyrig";
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function problem(status, code, message, headers = {}) {
  return json(status, { error: { message, type: "keyrig_backend", code } }, headers);
}

async function readBody(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return { refusal: problem(400, "unreadable_body", "keyrig could not read the request body.") };
  }
  if (text.length > MAX_BODY_CHARS) {
    return {
      refusal: problem(413, "body_too_large", `The request is larger than ${MAX_BODY_CHARS} characters.`),
    };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { refusal: problem(400, "invalid_json", "The request body is not valid JSON.") };
  }
  const refusal = envelopeProblem(body);
  if (refusal !== null) {
    return { refusal: problem(refusal.status, refusal.code, refusal.message) };
  }
  return { body };
}

async function signedIn(request, env, store) {
  const value = readCookie(request.headers.get("cookie"), BACKEND_COOKIE);
  if (value === null) {
    return null;
  }
  const id = await readSession(value, saltOf(env));
  if (id === null) {
    return null;
  }
  return store.sessionOwner(id, Math.floor(Date.now() / 1000));
}

async function accountRoute(request, env, store, url) {
  if (request.method === "GET") {
    const username = await signedIn(request, env, store);
    const account = username === null ? null : await store.accountByName(username);
    if (account === null) {
      return problem(401, "backend_sign_in", SIGN_IN_FIRST);
    }
    return json(200, { account: { username: account.username, role: account.role } });
  }
  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use GET or POST for the account.", { allow: "GET, POST" });
  }

  const mode = url.searchParams.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const read = await readBody(request);
  if (read.refusal) {
    return read.refusal;
  }
  const account = read.body.account ?? null;
  const invalid = accountProblem(account);
  if (invalid !== null) {
    return problem(400, "account_invalid", invalid);
  }

  const username = account.username.trim();
  const password = account.password;
  let existing = await store.accountByName(username);

  if (mode === "sign-up") {
    if (existing !== null) {
      return problem(409, "account_exists", "That account is already on this site. Sign in instead.");
    }
    const role = (await store.countAccounts()) === 0 ? "owner" : "viewer";
    await store.createAccount({ username, role, password: await hashPassword(password) });
    existing = await store.accountByName(username);
  } else if (existing === null || !(await verifyPassword(password, existing.password))) {
    return problem(403, "account_refused", "That account name and password do not match.");
  }

  const session = await issueSession(saltOf(env));
  await store.createSession({
    id: session.id,
    username,
    expires: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE,
  });
  return json(
    200,
    { account: { username, role: existing?.role ?? "viewer" } },
    { "set-cookie": backendCookie(session.value) },
  );
}

async function toolsRoute(request, env, store) {
  if (request.method === "GET") {
    return json(200, { tools: await store.listTools(MAX_TOOL_ROWS) });
  }
  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use GET or POST for the marketplace.", {
      allow: "GET, POST",
    });
  }
  const username = await signedIn(request, env, store);
  if (username === null) {
    return problem(401, "backend_sign_in", SIGN_IN_FIRST);
  }
  const read = await readBody(request);
  if (read.refusal) {
    return read.refusal;
  }
  const tool = read.body.publishedTools ?? null;
  const refusal = toolProblem(tool);
  if (refusal !== null) {
    return problem(400, "publish_refused", refusal);
  }
  const row = {
    id: crypto.randomUUID(),
    name: tool.name.trim(),
    publisher: username,
    risk: tool.risk,
    description: tool.description.trim(),
    createdAt: new Date().toISOString(),
  };
  await store.createTool(row);
  return json(201, { tool: { id: row.id, name: row.name, publisher: row.publisher } });
}

async function requestsRoute(request, env, store) {
  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use POST for a feature request.", { allow: "POST" });
  }
  const username = await signedIn(request, env, store);
  if (username === null) {
    return problem(401, "backend_sign_in", SIGN_IN_FIRST);
  }
  const read = await readBody(request);
  if (read.refusal) {
    return read.refusal;
  }
  const item = read.body.featureRequests ?? null;
  const refusal = requestProblem(item);
  if (refusal !== null) {
    return problem(400, "request_invalid", refusal);
  }
  const row = {
    id: crypto.randomUUID(),
    username,
    title: item.title.trim(),
    detail: typeof item.detail === "string" ? item.detail.trim() : "",
    createdAt: new Date().toISOString(),
  };
  await store.createRequest(row);
  return json(201, { featureRequest: { id: row.id, title: row.title } });
}

async function votesRoute(request, env, store) {
  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use POST for a vote.", { allow: "POST" });
  }
  const username = await signedIn(request, env, store);
  if (username === null) {
    return problem(401, "backend_sign_in", SIGN_IN_FIRST);
  }
  const read = await readBody(request);
  if (read.refusal) {
    return read.refusal;
  }
  const vote = read.body.votes ?? null;
  const refusal = voteProblem(vote);
  if (refusal !== null) {
    return problem(400, "vote_invalid", refusal);
  }
  await store.saveVote({
    username,
    toolId: vote.toolId,
    up: vote.up,
    createdAt: new Date().toISOString(),
  });
  return json(200, { votes: { toolId: vote.toolId, up: vote.up } });
}

async function rolesRoute(request, env, store) {
  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use POST for a role change.", { allow: "POST" });
  }
  const actor = await signedIn(request, env, store);
  const actorRow = actor === null ? null : await store.accountByName(actor);
  if (actorRow === null) {
    return problem(401, "backend_sign_in", SIGN_IN_FIRST);
  }
  const read = await readBody(request);
  if (read.refusal) {
    return read.refusal;
  }
  const account = read.body.account ?? null;
  if (account === null || typeof account !== "object" || Array.isArray(account)) {
    return problem(400, "account_invalid", "A role change names one account and one role.");
  }
  const target = typeof account.username === "string" ? account.username.trim() : "";
  const targetRow = await store.accountByName(target);
  if (targetRow === null) {
    return problem(404, "account_unknown", "That account is not on this site.");
  }
  const refusal = roleProblem({
    actor,
    target,
    actorRole: actorRow.role,
    targetRole: targetRow.role,
    wanted: account.role,
    ownerCount: await store.ownerCount(),
  });
  if (refusal !== null) {
    return problem(403, "role_forbidden", refusal);
  }
  await store.setRole(target, account.role);
  return json(200, { account: { username: target, role: account.role } });
}

/** The routes. The store holds the statements, so a test needs no database. */
export async function routeWithStore(request, env, pathname, store) {
  const url = new URL(request.url);
  switch (pathname) {
    case "/api/backend/account":
      return accountRoute(request, env, store, url);
    case "/api/backend/tools":
      return toolsRoute(request, env, store);
    case "/api/backend/requests":
      return requestsRoute(request, env, store);
    case "/api/backend/votes":
      return votesRoute(request, env, store);
    case "/api/backend/roles":
      return rolesRoute(request, env, store);
    default:
      return problem(404, "no_route", "That keyrig backend route does not exist.");
  }
}

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS backend_accounts (username TEXT PRIMARY KEY, role TEXT NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS backend_sessions (id TEXT PRIMARY KEY, username TEXT NOT NULL, expires INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS backend_tools (id TEXT PRIMARY KEY, name TEXT NOT NULL, publisher TEXT NOT NULL, risk TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS backend_requests (id TEXT PRIMARY KEY, username TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS backend_votes (username TEXT NOT NULL, tool_id TEXT NOT NULL, up INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (username, tool_id))",
];

/** The D1 store. Every row below is one account, one tool, one request or one vote. */
export function d1Store(db) {
  let schema;
  const ensureSchema = () => {
    if (schema === undefined) {
      schema = (async () => {
        for (const statement of SCHEMA) {
          await db.prepare(statement).run();
        }
      })().catch((error) => {
        schema = undefined;
        throw error;
      });
    }
    return schema;
  };

  const first = async (sql, ...args) => {
    await ensureSchema();
    const row = await db.prepare(sql).bind(...args).first();
    return row ?? null;
  };
  const all = async (sql, ...args) => {
    await ensureSchema();
    const result = await db.prepare(sql).bind(...args).all();
    return result?.results ?? [];
  };
  const run = async (sql, ...args) => {
    await ensureSchema();
    await db.prepare(sql).bind(...args).run();
  };

  return {
    accountByName: (username) =>
      first("SELECT username, role, password FROM backend_accounts WHERE username = ?", username),
    countAccounts: async () => Number((await first("SELECT COUNT(*) AS n FROM backend_accounts"))?.n ?? 0),
    createAccount: ({ username, role, password }) =>
      run(
        "INSERT INTO backend_accounts (username, role, password, created_at) VALUES (?, ?, ?, ?)",
        username,
        role,
        password,
        new Date().toISOString(),
      ),
    setRole: (username, role) => run("UPDATE backend_accounts SET role = ? WHERE username = ?", role, username),
    ownerCount: async () =>
      Number((await first("SELECT COUNT(*) AS n FROM backend_accounts WHERE role = 'owner'"))?.n ?? 0),
    createSession: ({ id, username, expires }) =>
      run("INSERT INTO backend_sessions (id, username, expires) VALUES (?, ?, ?)", id, username, expires),
    sessionOwner: async (id, now) =>
      (await first("SELECT username FROM backend_sessions WHERE id = ? AND expires > ?", id, now))?.username ??
      null,
    listTools: (limit) =>
      all(
        "SELECT id, name, publisher, risk, description, created_at FROM backend_tools ORDER BY created_at DESC LIMIT ?",
        limit,
      ),
    createTool: ({ id, name, publisher, risk, description, createdAt }) =>
      run(
        "INSERT INTO backend_tools (id, name, publisher, risk, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id,
        name,
        publisher,
        risk,
        description,
        createdAt,
      ),
    createRequest: ({ id, username, title, detail, createdAt }) =>
      run(
        "INSERT INTO backend_requests (id, username, title, detail, created_at) VALUES (?, ?, ?, ?, ?)",
        id,
        username,
        title,
        detail,
        createdAt,
      ),
    saveVote: ({ username, toolId, up, createdAt }) =>
      run(
        "INSERT INTO backend_votes (username, tool_id, up, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(username, tool_id) DO UPDATE SET up = excluded.up, created_at = excluded.created_at",
        username,
        toolId,
        up ? 1 : 0,
        createdAt,
      ),
  };
}

/**
 * The route entry for the Worker. Without a database binding the whole route
 * set refuses the call, so local mode and the hosted model never depend on it.
 */
export async function backendRoute(request, env, pathname) {
  if (env === undefined || env === null || env.DB === undefined || env.DB === null) {
    return problem(503, "no_database", NOT_SET_UP);
  }
  return routeWithStore(request, env, pathname, d1Store(env.DB));
}
