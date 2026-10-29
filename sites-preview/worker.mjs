// Static asset worker for the keyrig SPA, with the optional hosted model.
//
// It serves the built file when the path matches one. Otherwise it returns
// index.html with status 200, so /providers, /security and /app work on a
// direct visit. Assets with a file extension keep their 404.
//
// /api/ai/v1/* is the one server route. It forwards to the Workers AI REST
// API with the owner's token. The route needs an access code, exchanged for a
// signed cookie at /hosted. Every call is counted before it runs, and a
// missing database refuses the call, so the route never runs uncapped.
import {
  MAX_BODY_CHARS,
  bodyProblem,
  dayKey,
  exceededScope,
  hashAddress,
  issueSession,
  modelListResponse,
  readCookie,
  readSession,
  safeEqual,
  secondsUntilReset,
  sessionCookie,
  unlockPage,
  upstreamBody,
} from "./hosted.mjs";

const ACCOUNT_PATTERN = /^[a-f0-9]{32}$/i;
const UPSTREAM = "https://api.cloudflare.com/client/v4/accounts";
const NOT_SET_UP = "The hosted model is not set up on this site.";
const SIGN_IN = "Open /hosted once to unlock the hosted model in this browser.";
const USAGE_TABLE =
  "CREATE TABLE IF NOT EXISTS hosted_usage (day TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, scope, key))";

let schema;

function ensureSchema(db) {
  if (schema === undefined) {
    schema = db.exec(USAGE_TABLE).catch((error) => {
      schema = undefined;
      throw error;
    });
  }
  return schema;
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

function html(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function problem(status, code, message, headers = {}) {
  return json(status, { error: { message, type: "hosted_model", code } }, headers);
}

function countOf(result) {
  const value = result?.results?.[0]?.calls;
  return typeof value === "number" ? value : 0;
}

/** The route needs all four values. A short code counts as missing. */
function configured(env) {
  return (
    typeof env.CF_ACCOUNT_ID === "string" &&
    ACCOUNT_PATTERN.test(env.CF_ACCOUNT_ID) &&
    typeof env.CF_AI_TOKEN === "string" &&
    env.CF_AI_TOKEN.length > 0 &&
    typeof env.HOSTED_ACCESS_CODE === "string" &&
    env.HOSTED_ACCESS_CODE.length >= 8
  );
}

function saltOf(env) {
  return env.HOSTED_IP_SALT ?? "keyrig";
}

async function sessionOf(request, env) {
  return readSession(readCookie(request.headers.get("cookie")), saltOf(env));
}

async function hostedPage(request, env) {
  if (request.method === "GET") {
    const id = await sessionOf(request, env);
    return html(200, unlockPage({ signedIn: id !== null }));
  }
  if (request.method !== "POST") {
    return html(405, unlockPage({ signedIn: false, error: "Use the form to unlock." }), { allow: "GET, POST" });
  }
  if (!configured(env)) {
    return html(503, unlockPage({ signedIn: false, error: NOT_SET_UP }));
  }

  const form = await request.text();
  if (form.length > 2_000) {
    return html(413, unlockPage({ signedIn: false, error: "The form was too large." }));
  }
  const code = new URLSearchParams(form).get("code") ?? "";
  if (!safeEqual(code, env.HOSTED_ACCESS_CODE)) {
    return html(401, unlockPage({ signedIn: false, error: "That code is not right." }));
  }

  const session = await issueSession(saltOf(env));
  return new Response(null, {
    status: 303,
    headers: { location: "/app", "set-cookie": sessionCookie(session.value), "cache-control": "no-store" },
  });
}

async function hostedChat(request, env, userId) {
  if (env.DB === undefined || env.DB === null) {
    return problem(503, "no_database", NOT_SET_UP);
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return problem(400, "unreadable_body", "keyrig could not read the request body.");
  }
  if (text.length > MAX_BODY_CHARS) {
    return problem(413, "body_too_large", `The request is larger than ${MAX_BODY_CHARS} characters.`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return problem(400, "invalid_json", "The request body is not valid JSON.");
  }

  const refusal = bodyProblem(body);
  if (refusal !== null) {
    return problem(refusal.status, "invalid_request", refusal.message);
  }

  try {
    await ensureSchema(env.DB);
  } catch {
    return problem(503, "no_database", NOT_SET_UP);
  }

  const day = dayKey();
  const address = await hashAddress(request.headers.get("cf-connecting-ip") ?? "unknown", saltOf(env));
  const dayRow = (scope, key) =>
    env.DB.prepare("SELECT calls FROM hosted_usage WHERE day = ? AND scope = ? AND key = ?").bind(
      day,
      scope,
      key,
    );

  let rows;
  try {
    rows = await env.DB.batch([dayRow("user", userId), dayRow("address", address), dayRow("site", "all")]);
  } catch {
    return problem(503, "no_database", NOT_SET_UP);
  }

  const scope = exceededScope({
    user: countOf(rows[0]),
    address: countOf(rows[1]),
    site: countOf(rows[2]),
  });
  if (scope !== null) {
    const message =
      scope === "site"
        ? "The hosted model reached its limit for today. Use your own key, or come back tomorrow."
        : "You reached the hosted limit for today. Use your own key, or come back tomorrow.";
    return problem(429, "hosted_limit", message, { "retry-after": String(secondsUntilReset()) });
  }

  // Count the call before it runs. A slow stream cannot outrun the counter.
  const bump = (itemScope, key) =>
    env.DB.prepare(
      "INSERT INTO hosted_usage (day, scope, key, calls) VALUES (?, ?, ?, 1) ON CONFLICT(day, scope, key) DO UPDATE SET calls = calls + 1",
    ).bind(day, itemScope, key);
  try {
    await env.DB.batch([bump("user", userId), bump("address", address), bump("site", "all")]);
  } catch {
    return problem(503, "no_database", NOT_SET_UP);
  }

  const target = `${UPSTREAM}/${env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
  let response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.CF_AI_TOKEN}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(upstreamBody(body)),
      signal: request.signal,
    });
  } catch {
    return problem(502, "hosted_unreachable", "keyrig could not reach the hosted model. Try again.");
  }

  if (!response.ok) {
    // Never pass the upstream body on: it can name the account, not the caller.
    if (response.status === 401 || response.status === 403) {
      return problem(502, "hosted_auth", "The hosted model is not configured correctly on this site.");
    }
    if (response.status === 429) {
      return problem(429, "hosted_busy", "The hosted model is busy. Try again in a moment.", {
        "retry-after": "10",
      });
    }
    return problem(
      response.status >= 500 ? 502 : 400,
      "hosted_upstream",
      response.status >= 500
        ? "The hosted model failed. Try again."
        : `The hosted model refused the request (status ${response.status}).`,
    );
  }

  if (!response.body) {
    return problem(502, "hosted_empty", "The hosted model sent no answer. Try again.");
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function hostedRoute(request, env, pathname) {
  if (pathname === "/hosted") {
    return hostedPage(request, env);
  }
  if (!configured(env)) {
    return problem(503, "not_configured", NOT_SET_UP);
  }

  const userId = await sessionOf(request, env);
  if (userId === null) {
    return problem(403, "hosted_sign_in", SIGN_IN);
  }

  if (pathname === "/api/ai/v1/models") {
    if (request.method !== "GET") {
      return problem(405, "method_not_allowed", "Use GET for the model list.", { allow: "GET" });
    }
    return json(200, modelListResponse());
  }

  if (request.method !== "POST") {
    return problem(405, "method_not_allowed", "Use POST for a chat request.", { allow: "POST" });
  }
  return hostedChat(request, env, userId);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === "/hosted" ||
      url.pathname === "/api/ai/v1/models" ||
      url.pathname === "/api/ai/v1/chat/completions"
    ) {
      return hostedRoute(request, env, url.pathname);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return response;
    }
    if (/\.[a-z0-9]+$/i.test(url.pathname)) {
      return response;
    }
    // A new GET for the root. The old request cannot be the init argument.
    return env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
  },
};
