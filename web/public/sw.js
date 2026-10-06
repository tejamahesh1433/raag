const SHELL = "raag-shell-v2";
const OFFLINE_AUDIO = "raag-offline-audio-v1";
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL && k !== OFFLINE_AUDIO && !k.startsWith("raag-offline"))
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Offline audio: serve cached streams when available (path without query).
  if (/^\/api\/tracks\/\d+\/stream$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_AUDIO);
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })(),
    );
    return;
  }

  // Never cache other API / artwork.
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          const cache = await caches.open(SHELL);
          cache.put("/", res.clone());
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/index.html")),
    );
  }
});
