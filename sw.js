// Keeps a copy of the app shell so the notebook opens at once, with or without a connection.
// Pages are served from the copy; each opening fetches a fresh one in the background for next time.
const cacheName = "whist-shell-v2";
const shell = ["/index.html", "/app.mjs", "/cloud.mjs", "/score.mjs", "/players.mjs", "/style.css",
  "/cards.svg", "/icon.svg", "/apple-touch-icon.png", "/boot.mjs", "/auth.mjs", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName)
    // Some deployments lack some of these files, so a missing one must not block the install.
    .then(cache => Promise.allSettled(shell.map(path => cache.add(new Request(path, {cache:"no-store"})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name !== cacheName).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

// Replace the whole copy in one go, so the page and its scripts always come from the same version.
async function refresh() {
  const cache = await caches.open(cacheName);
  const before = await cache.match("/index.html").then(response => response?.text()).catch(() => null);
  const fetched = await Promise.all(shell.map(async path => {
    try {
      const response = await fetch(new Request(path, {cache:"no-store"}));
      return response.ok && !response.redirected ? [path, response] : null;
    } catch { return undefined; }
  }));
  // Offline or a flaky network: keep the copy as it is rather than mix two versions.
  if (fetched.includes(undefined)) return;
  const entries = fetched.filter(Boolean);
  const page = entries.find(([path]) => path === "/index.html");
  if (!page) return;
  const after = await page[1].clone().text();
  await Promise.all(entries.map(([path, response]) => cache.put(path, response)));
  if (before !== null && before !== after) {
    for (const client of await self.clients.matchAll()) client.postMessage({type:"whist-updated"});
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const page = request.mode === "navigate";
  if (!page && !shell.includes(url.pathname)) return;
  const key = page ? "/index.html" : url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(key);
    if (cached) {
      if (page) event.waitUntil(refresh());
      return cached;
    }
    const response = await fetch(request);
    const html = (response.headers.get("Content-Type") ?? "").includes("text/html");
    if (response.ok && !response.redirected && response.type === "basic" && html === page) {
      await cache.put(key, response.clone());
    }
    return response;
  })());
});
