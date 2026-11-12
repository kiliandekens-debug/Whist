// Keeps a copy of the app shell so the notebook opens without a connection.
// The network always wins when it answers; the copy is only a fallback.
const cacheName = "whist-shell-v1";
const shell = ["/index.html", "/app.mjs", "/cloud.mjs", "/score.mjs", "/players.mjs", "/style.css",
  "/cards.svg", "/icon.svg", "/apple-touch-icon.png", "/auth.mjs"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName)
    // Some deployments have no /auth.mjs, so a missing file must not block the install.
    .then(cache => Promise.allSettled(shell.map(path => cache.add(new Request(path, {cache:"no-store"})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name !== cacheName).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const page = request.mode === "navigate";
  if (!page && !shell.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = page ? "/index.html" : url.pathname;
    try {
      const response = await fetch(request);
      const html = (response.headers.get("Content-Type") ?? "").includes("text/html");
      if (response.ok && !response.redirected && response.type === "basic" && html === page) {
        await cache.put(key, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw error;
    }
  })());
});
