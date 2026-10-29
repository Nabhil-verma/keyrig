export interface FixtureRequest {
  method?: string;
  url?: string;
}

export interface FixtureResponse {
  status: number;
  headers?: Record<string, string>;
  chunks?: string[];
  body?: string;
}

export interface Fixture {
  name: string;
  recordedAt?: string;
  request?: FixtureRequest;
  response: FixtureResponse;
}

const encoder = new TextEncoder();

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function responseOf(fixture: Fixture): Response {
  const { status, headers, chunks, body } = fixture.response;
  if (chunks && chunks.length > 0) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, { status, headers: headers ?? {} });
  }
  return new Response(body ?? "", { status, headers: headers ?? {} });
}

/** Replay one recorded response. Fail when the request does not match the record. */
export function fetchFromFixture(fixture: Fixture): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    if (fixture.request?.url && url !== fixture.request.url) {
      throw new Error(`The fixture URL does not match: ${url}`);
    }
    if (fixture.request?.method && (init?.method ?? "GET") !== fixture.request.method) {
      throw new Error("The fixture method does not match.");
    }
    return responseOf(fixture);
  }) as typeof fetch;
}

/** Replay a recorded response and ignore the request URL. Use it for custom base URLs. */
export function fetchAlways(fixture: Fixture): typeof fetch {
  return (async () => responseOf(fixture)) as typeof fetch;
}

/** A stream that puts each chunk after a delay and stops when the signal aborts. */
export function slowStreamResponse(chunks: string[], delayMs = 30): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;
      const push = (): void => {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index] ?? ""));
        index += 1;
        setTimeout(push, delayMs);
      };
      push();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function sseData(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}
