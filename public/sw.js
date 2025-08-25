const CACHE = "workout-cache-v1";
const APP_SHELL_FALLBACK = "/index.html";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(clients.claim()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || req.url.includes("/@")) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      try {
        const net = await fetch(req);
        cache.put(req, net.clone());
        return net;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await cache.match(APP_SHELL_FALLBACK);
          return shell || fetch(APP_SHELL_FALLBACK);
        }
        throw err;
      }
    })
  );
});
