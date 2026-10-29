// The hosted model: the allowlist, the clamps and the quota math.
//
// This file holds no binding and no fetch. The Worker keeps the routes and the
// D1 calls, so every rule here is pure and can be tested in node.
//
// The hosted model is the one provider that does not run from the browser.
// keyrig pays for it, so every limit below is a spending limit.

/** The three open models. The Worker rejects every other model. */
export const HOSTED_MODELS = [
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", label: "Llama 3.1 8B" },
  { id: "@cf/openai/gpt-oss-20b", label: "gpt-oss 20B" },
  { id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B" },
];

/** The output clamp. 500 requests at 700 tokens is the daily worst case. */
export const MAX_OUTPUT_TOKENS = 700;
export const DEFAULT_OUTPUT_TOKENS = 400;
export const MAX_MESSAGES = 40;
export const MAX_PROMPT_CHARS = 32_000;
export const MAX_BODY_CHARS = 200_000;

/** Requests for each scope in one UTC day. */
export const LIMITS = Object.freeze({ user: 30, address: 120, site: 500 });

export const ROLES = Object.freeze(["system", "user", "assistant"]);

export function isHostedModel(model) {
  return typeof model === "string" && HOSTED_MODELS.some((item) => item.id === model);
}

/** The OpenAI list shape, so the existing model picker reads it unchanged. */
export function modelListResponse() {
  return {
    object: "list",
    data: HOSTED_MODELS.map((item) => ({ id: item.id, object: "model", owned_by: "keyrig" })),
  };
}

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** The wait a 429 shows, in whole seconds, until the counters reset. */
export function secondsUntilReset(date = new Date()) {
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((next - date.getTime()) / 1000));
}

export function clampMaxTokens(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_OUTPUT_TOKENS;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_OUTPUT_TOKENS);
}

/**
 * Return the status and the reason to refuse the body, or null when it is
 * acceptable. The reason is shown to the visitor, so it is one plain sentence.
 */
export function bodyProblem(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, message: "The request body is not an object." };
  }
  if (!isHostedModel(body.model)) {
    return { status: 400, message: "That model is not on the hosted list." };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { status: 400, message: "The request has no messages." };
  }
  if (body.messages.length > MAX_MESSAGES) {
    return { status: 413, message: `The request has more than ${MAX_MESSAGES} messages.` };
  }
  let chars = 0;
  for (const message of body.messages) {
    if (message === null || typeof message !== "object") {
      return { status: 400, message: "A message is not an object." };
    }
    if (!ROLES.includes(message.role)) {
      return { status: 400, message: "A message has a role the hosted model does not accept." };
    }
    if (typeof message.content !== "string") {
      return { status: 400, message: "A message has no text. The hosted model takes text only." };
    }
    chars += message.content.length;
  }
  if (chars > MAX_PROMPT_CHARS) {
    return { status: 413, message: `The prompt is longer than ${MAX_PROMPT_CHARS} characters.` };
  }
  return null;
}

/** The body sent upstream. Unknown fields are dropped, not forwarded. */
export function upstreamBody(body) {
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? Math.min(Math.max(body.temperature, 0), 2)
      : null;
  return {
    model: body.model,
    messages: body.messages.map((message) => ({ role: message.role, content: message.content })),
    stream: true,
    max_tokens: clampMaxTokens(body.max_tokens),
    ...(temperature !== null ? { temperature } : {}),
  };
}

/** The first scope at or over its limit, or null. */
export function exceededScope(counts) {
  if (counts.user >= LIMITS.user) {
    return "user";
  }
  if (counts.address >= LIMITS.address) {
    return "address";
  }
  if (counts.site >= LIMITS.site) {
    return "site";
  }
  return null;
}

/** A stable address key. The salt keeps the hash from being an address list. */
export async function hashAddress(address, salt) {
  const data = new TextEncoder().encode(`${salt}:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The cookie that proves the visitor entered the access code. */
export const COOKIE_NAME = "keyrig_hosted";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function cookieKey(salt) {
  return `${salt}|hosted-cookie`;
}

/** Compare two strings without an early exit. */
export function safeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signature(id, expires, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(cookieKey(salt)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`keyrig-hosted|${id}|${expires}`);
  const digest = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A new session value. The id is random, so two visitors never share a budget. */
export async function issueSession(salt, now = Date.now()) {
  const id = randomHex(16);
  const expires = Math.floor(now / 1000) + COOKIE_MAX_AGE;
  return { id, value: `${id}.${expires}.${await signature(id, expires, salt)}` };
}

/** The session id, or null when the value is absent, expired or altered. */
export async function readSession(value, salt, now = Date.now()) {
  if (typeof value !== "string") {
    return null;
  }
  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [id, expiresText, given] = parts;
  if (!/^[a-f0-9]{32}$/.test(id) || !/^[0-9]{1,12}$/.test(expiresText)) {
    return null;
  }
  const expires = Number(expiresText);
  if (expires * 1000 <= now) {
    return null;
  }
  const expected = await signature(id, expires, salt);
  return safeEqual(given, expected) ? id : null;
}

/** Read one cookie from a Cookie header. */
export function readCookie(header, name = COOKIE_NAME) {
  if (typeof header !== "string") {
    return null;
  }
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

export function sessionCookie(value) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

/** The unlock page. It holds no user text, so nothing needs escaping. */
export function unlockPage({ signedIn, error }) {
  const body = signedIn
    ? `<p class="ok">This browser is signed in to the hosted model.</p>
       <p><a class="go" href="/app">Open the workspace</a></p>`
    : `<form method="post" action="/hosted">
         <label for="code">Access code</label>
         <input id="code" name="code" type="password" autocomplete="current-password" required autofocus />
         <button type="submit">Unlock the hosted model</button>
       </form>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>keyrig hosted</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d10; color: #e8eaed;
         font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; }
  main { width: min(420px, 88vw); padding: 28px; border: 1px solid #2a2f37; border-radius: 16px; background: #12151a; }
  h1 { margin: 0 0 6px; font-size: 20px; letter-spacing: -0.02em; }
  p { margin: 0 0 16px; color: #a6adb8; font-size: 13px; }
  label { display: block; margin: 18px 0 6px; font-size: 12px; font-weight: 650; color: #a6adb8; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 9px; border: 1px solid #3a414b;
          background: #0b0d10; color: inherit; font: inherit; }
  button, .go { display: block; width: 100%; margin-top: 16px; padding: 10px 12px; border: 0; border-radius: 9px;
                background: #e2a33c; color: #14100a; font: inherit; font-weight: 700; text-align: center;
                text-decoration: none; cursor: pointer; }
  .err { color: #f0a8a0; font-size: 13px; }
  .ok { color: #8fd6c2; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>keyrig hosted</h1>
  <p>The hosted model is the one model that keyrig pays for. One code unlocks it in this browser.</p>
  ${error === undefined ? "" : `<p class="err">${error}</p>`}
  ${body}
</main>
</body>
</html>`;
}
