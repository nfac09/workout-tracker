// public/sw.js

// Bump this to force updates after a deploy
const CACHE = "workout-cache-v4";

// The service worker scope ends with a trailing slash, e.g.
// https://nfac09.github.io/workout-tracker/
const BASE = self.registration.scope;
const APP_SHELL_FALLBACK = BASE + "index.html";

// Install: take over immediately and warm the cache with the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      self.skipWaiting();
      const cache = await caches.open(CACHE);
      // cache:'reload' ensures we don't reuse a stale HTTP cache entry
      await cache.add(new Request(APP_SHELL_FALLBACK, { cache: "reload" }));
    })()
  );
});

// Activate: remove old caches and claim clients right away
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Fetch: network-first for GET; fall back to cache and then app shell for navigations
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GETs, ignore devtools and non-http requests
  if (req.method !== "GET" || !req.url.startsWith("http")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await fetch(req);
        // Clone and store successful responses for offline use
        cache.put(req, net.clone());
        return net;
      } catch (err) {
        // Try cached response
        const cached = await cache.match(req);
        if (cached) return cached;

        // For navigation requests, fall back to the app shell
        if (req.mode === "navigate") {
          const shell = await cache.match(APP_SHELL_FALLBACK);
          if (shell) return shell;
          return fetch(APP_SHELL_FALLBACK);
        }

        // Last resort: rethrow to surface the error
        throw err;
      }
    })()
  );
});
