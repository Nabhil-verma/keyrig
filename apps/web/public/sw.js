// PV-01: keyrig starts offline from the app shell.
//
// Only the shell is cached: the HTML, the manifest and the small theme file.
// API responses, keys and vault data are never cached. The vault is encrypted
// in localStorage, which this worker does not read. A new deploy changes the
// cache name, so the old shell is removed on activation.

const CACHE = "keyrig-shell-v1";
const SHELL = ["/", "/index.html", "/theme-init.js", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  // Never cache an API response. The hosted model and the backend use /api/.
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? Response.error())),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached !== undefined) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
