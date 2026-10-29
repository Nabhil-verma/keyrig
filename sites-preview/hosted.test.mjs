import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  HOSTED_MODELS,
  LIMITS,
  MAX_MESSAGES,
  MAX_OUTPUT_TOKENS,
  MAX_PROMPT_CHARS,
  bodyProblem,
  clampMaxTokens,
  dayKey,
  exceededScope,
  hashAddress,
  isHostedModel,
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
import worker from "./worker.mjs";

const MODEL = HOSTED_MODELS[0].id;
const ACCOUNT = "a".repeat(32);
const CODE = "correct-horse-battery-staple";
const SALT = "salt";

function message(text = "Hello") {
  return [{ role: "user", content: text }];
}

function fakeDatabase(seed = {}) {
  const counts = new Map(Object.entries(seed));
  return {
    counts,
    exec: async () => ({ success: true }),
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
      };
    },
    async batch(statements) {
      return statements.map((statement) => {
        if (statement.sql.startsWith("SELECT")) {
          const calls = counts.get(statement.args.join("|"));
          return { results: calls === undefined ? [] : [{ calls }] };
        }
        const key = statement.args.join("|");
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return { results: [] };
      });
    },
  };
}

function fakeAssets() {
  return {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/") {
        return new Response("<html>keyrig</html>", { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("missing", { status: 404 });
    },
  };
}

function environment(overrides = {}) {
  return {
    ASSETS: fakeAssets(),
    CF_ACCOUNT_ID: ACCOUNT,
    CF_AI_TOKEN: "test-token",
    HOSTED_ACCESS_CODE: CODE,
    HOSTED_IP_SALT: SALT,
    DB: fakeDatabase(),
    ...overrides,
  };
}

async function cookieFor() {
  const session = await issueSession(SALT);
  return { id: session.id, header: `${COOKIE_NAME}=${session.value}` };
}

function chatRequest(body, headers = {}) {
  return new Request("https://keyrig.freebuff.page/api/ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.9",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const STREAM = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the hosted allowlist", () => {
  it("holds the three models and rejects every other name", () => {
    expect(HOSTED_MODELS).toHaveLength(3);
    for (const model of HOSTED_MODELS) {
      expect(isHostedModel(model.id)).toBe(true);
    }
    expect(isHostedModel("gpt-5.4")).toBe(false);
    expect(isHostedModel(undefined)).toBe(false);
  });

  it("answers the model list in the OpenAI shape the picker reads", () => {
    const payload = modelListResponse();
    expect(payload.object).toBe("list");
    expect(payload.data.map((item) => item.id)).toEqual(HOSTED_MODELS.map((item) => item.id));
    expect(payload.data.every((item) => item.owned_by === "keyrig")).toBe(true);
  });
});

describe("the hosted clamps", () => {
  it("clamps the output limit to 700 tokens", () => {
    expect(clampMaxTokens(5000)).toBe(MAX_OUTPUT_TOKENS);
    expect(clampMaxTokens(120)).toBe(120);
    expect(clampMaxTokens(0)).toBe(400);
    expect(clampMaxTokens(undefined)).toBe(400);
  });

  it("refuses an unknown model and a body with no messages", () => {
    expect(bodyProblem({ model: "gpt-5.4", messages: message() })?.status).toBe(400);
    expect(bodyProblem({ model: MODEL, messages: [] })?.status).toBe(400);
    expect(bodyProblem({ model: MODEL })).not.toBeNull();
    expect(bodyProblem(null)).not.toBeNull();
  });

  it("refuses too many messages and too much text with 413", () => {
    const many = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: "user", content: "x" }));
    expect(bodyProblem({ model: MODEL, messages: many })?.status).toBe(413);
    const long = bodyProblem({ model: MODEL, messages: message("x".repeat(MAX_PROMPT_CHARS + 1)) });
    expect(long?.status).toBe(413);
  });

  it("refuses a role and a content type it cannot forward", () => {
    expect(bodyProblem({ model: MODEL, messages: [{ role: "tool", content: "x" }] })?.status).toBe(400);
    expect(bodyProblem({ model: MODEL, messages: [{ role: "user", content: [] }] })?.status).toBe(400);
  });

  it("accepts a normal chat body", () => {
    expect(bodyProblem({ model: MODEL, messages: message() })).toBeNull();
  });

  it("drops unknown fields and keeps only the forwarded ones", () => {
    const body = upstreamBody({
      model: MODEL,
      messages: message(),
      max_tokens: 9000,
      temperature: 12,
      tools: [{ name: "rm" }],
      stream_options: { include_usage: true },
    });
    expect(body).toEqual({
      model: MODEL,
      messages: message(),
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 2,
    });
  });

  it("counts the three scopes and names the narrowest one that is reached", () => {
    expect(exceededScope({ user: 0, address: 0, site: 0 })).toBeNull();
    expect(exceededScope({ user: LIMITS.user, address: 0, site: 0 })).toBe("user");
    expect(exceededScope({ user: 0, address: LIMITS.address, site: 0 })).toBe("address");
    expect(exceededScope({ user: 0, address: 0, site: LIMITS.site })).toBe("site");
  });
});

describe("the hosted session", () => {
  it("signs a session and reads it back", async () => {
    const session = await issueSession(SALT);
    expect(await readSession(session.value, SALT)).toBe(session.id);
    expect(session.value).toMatch(/^[a-f0-9]{32}\.[0-9]+\.[a-f0-9]{64}$/);
  });

  it("refuses an altered, expired or foreign session", async () => {
    const session = await issueSession(SALT);
    const [id, expires, signature] = session.value.split(".");
    expect(await readSession(`${id}.${expires}.${signature.slice(0, -1)}0`, SALT)).toBeNull();
    expect(await readSession(session.value, "another salt")).toBeNull();
    expect(await readSession(session.value, SALT, Number(expires) * 1000 + 1)).toBeNull();
    expect(await readSession(`x.${expires}.${signature}`, SALT)).toBeNull();
    expect(await readSession(null, SALT)).toBeNull();
  });

  it("compares a code without an early exit", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("builds a cookie the browser cannot read from script", () => {
    const header = sessionCookie("value");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${COOKIE_MAX_AGE}`);
    expect(readCookie(`a=1; ${COOKIE_NAME}=value; b=2`)).toBe("value");
    expect(readCookie("a=1")).toBeNull();
    expect(readCookie(undefined)).toBeNull();
  });

  it("renders the unlock page in both states", () => {
    expect(unlockPage({ signedIn: false })).toContain('name="code"');
    expect(unlockPage({ signedIn: true })).toContain("signed in");
    expect(unlockPage({ signedIn: false, error: "That code is not right." })).toContain("not right");
  });

  it("hashes an address with the salt and stays stable", async () => {
    const first = await hashAddress("203.0.113.9", SALT);
    expect(first).toBe(await hashAddress("203.0.113.9", SALT));
    expect(first).not.toBe(await hashAddress("203.0.113.9", "pepper"));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gives a UTC day and a positive wait until the next one", () => {
    expect(dayKey(new Date("2026-10-29T23:59:59.000Z"))).toBe("2026-10-29");
    expect(secondsUntilReset(new Date("2026-10-29T23:59:00.000Z"))).toBe(60);
  });
});

describe("the hosted route", () => {
  it("refuses a call when the site is not configured", async () => {
    const response = await worker.fetch(
      new Request("https://keyrig.freebuff.page/api/ai/v1/models"),
      environment({ CF_AI_TOKEN: "" }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
  });

  it("refuses a call when the access code is missing", async () => {
    const response = await worker.fetch(
      new Request("https://keyrig.freebuff.page/api/ai/v1/models"),
      environment({ HOSTED_ACCESS_CODE: "" }),
    );
    expect(response.status).toBe(503);
  });

  it("offers the unlock page", async () => {
    const response = await worker.fetch(
      new Request("https://keyrig.freebuff.page/hosted"),
      environment(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('name="code"');
  });

  it("keeps the route closed without the cookie", async () => {
    const response = await worker.fetch(
      new Request("https://keyrig.freebuff.page/api/ai/v1/models"),
      environment(),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("hosted_sign_in");
  });

  it("refuses a wrong code and accepts the right one", async () => {
    const wrong = await worker.fetch(
      new Request("https://keyrig.freebuff.page/hosted", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "code=nope",
      }),
      environment(),
    );
    expect(wrong.status).toBe(401);

    const right = await worker.fetch(
      new Request("https://keyrig.freebuff.page/hosted", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `code=${encodeURIComponent(CODE)}`,
      }),
      environment(),
    );
    expect(right.status).toBe(303);
    expect(right.headers.get("location")).toBe("/app");
    const cookie = right.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");

    const models = await worker.fetch(
      new Request("https://keyrig.freebuff.page/api/ai/v1/models", {
        headers: { cookie: cookie.split(";")[0] },
      }),
      environment(),
    );
    expect(models.status).toBe(200);
    expect((await models.json()).data).toHaveLength(3);
  });

  it("refuses a call when the database is missing, instead of running uncapped", async () => {
    const { header } = await cookieFor();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(
      chatRequest({ model: MODEL, messages: message() }, { cookie: header }),
      environment({ DB: undefined }),
    );
    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a body that names a model outside the list", async () => {
    const { header } = await cookieFor();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(
      chatRequest({ model: "gpt-5.4", messages: message() }, { cookie: header }),
      environment(),
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 429 with a wait when this visitor reached its limit", async () => {
    const { id, header } = await cookieFor();
    const database = fakeDatabase({ [`${dayKey()}|user|${id}`]: LIMITS.user });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(
      chatRequest({ model: MODEL, messages: message() }, { cookie: header }),
      environment({ DB: database }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("counts the call, forwards the allowlisted body and returns the stream", async () => {
    const { id, header } = await cookieFor();
    const database = fakeDatabase();
    const fetchSpy = vi.fn(async () => new Response(STREAM, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await worker.fetch(
      chatRequest(
        { model: MODEL, messages: message(), max_tokens: 9000, tools: [{ name: "x" }] },
        { cookie: header },
      ),
      environment({ DB: database }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("hi");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`);
    expect(init.headers.authorization).toBe("Bearer test-token");
    const sent = JSON.parse(init.body);
    expect(sent.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(sent.tools).toBeUndefined();
    expect(sent.stream).toBe(true);

    const day = dayKey();
    expect(database.counts.get(`${day}|site|all`)).toBe(1);
    expect(database.counts.get(`${day}|user|${id}`)).toBe(1);
  });

  it("keeps serving the app and its deep links", async () => {
    const response = await worker.fetch(
      new Request("https://keyrig.freebuff.page/providers"),
      environment(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("keyrig");
  });
});
