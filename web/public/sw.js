const CACHE = "local-music-shell-v1";
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache API / streams / artwork — only app shell + static assets.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigation: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          const cache = await caches.open(CACHE);
          cache.put("/", res.clone());
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/index.html")),
    );
  }
});
