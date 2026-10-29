// Static asset worker for the keyrig SPA.
// It serves the built file when the path matches one. Otherwise it returns
// index.html with status 200, so /providers, /security and /app work on a
// direct visit. Assets with a file extension keep their 404.
export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return response;
    }
    const url = new URL(request.url);
    if (/\.[a-z0-9]+$/i.test(url.pathname)) {
      return response;
    }
    // A new GET for the root. The old request cannot be the init argument.
    return env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
  },
};
