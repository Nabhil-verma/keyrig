#!/usr/bin/env node
/**
 * A local OpenAI-compatible server for development tests.
 *
 * It needs no key and no network. It is not part of the product.
 *   npm run fake-provider
 * Then use the OpenAI-compatible provider with base URL http://127.0.0.1:8788/v1.
 *
 * A key that starts with "bad-key" gets status 401. A prompt with "slow" gets
 * one chunk each second, so the Stop button is easy to test.
 */
import { createServer } from "node:http";

const PORT = 8788;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS);
    response.end();
    return;
  }

  if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "Not found", code: "not_found" } }));
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const authorization = request.headers.authorization ?? "";
    if (authorization.includes("bad-key")) {
      response.writeHead(401, { ...CORS, "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: { message: "Incorrect API key provided.", type: "invalid_request_error", code: "invalid_api_key" },
        }),
      );
      return;
    }

    let prompt = "";
    try {
      const parsed = JSON.parse(body);
      prompt = parsed.messages?.at(-1)?.content ?? "";
    } catch {
      response.writeHead(400, { ...CORS, "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "Bad JSON", code: "invalid_json" } }));
      return;
    }

    response.writeHead(200, {
      ...CORS,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const slow = String(prompt).toLowerCase().includes("slow");
    const words = slow
      ? ["This ", "answer ", "arrives ", "one ", "word ", "at ", "a ", "time."]
      : ["Hello ", "from ", "the ", "local ", "test ", "provider. ", "The ", "key ", "stayed ", "in ", "the ", "browser."];
    const delay = slow ? 2000 : 45;
    let index = 0;

    const send = () => {
      if (index < words.length) {
        const chunk = {
          id: "chatcmpl-local-test",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: words[index] }, finish_reason: null }],
        };
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        index += 1;
        setTimeout(send, delay);
        return;
      }
      const final = {
        id: "chatcmpl-local-test",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 42,
          completion_tokens: 11,
          prompt_tokens_details: { cached_tokens: 0 },
        },
      };
      response.write(`data: ${JSON.stringify(final)}\n\n`);
      response.write("data: [DONE]\n\n");
      response.end();
    };

    response.on("close", () => {
      // The browser stopped the request. Stop the timer chain.
      index = words.length;
    });
    send();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake provider: http://127.0.0.1:${PORT}/v1`);
});
