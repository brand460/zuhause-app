// Cache version — bump this string whenever you want to force-clear old caches
const CACHE_NAME = 'zuhause-assets-v3';

// Assets that are safe to cache forever because they have a content-hash in their filename.
// Matches filenames like: index-BxY3kZ9a.js, vendor-A1b2C3d4.css
const HASHED_ASSET_RE = /\/assets\/.*\.[a-f0-9]{8,}\.(js|css|woff2?|png|svg|webp)(\?.*)?$/i;

// ---------------------------------------------------------------------------
// INSTALL — skip waiting so the new SW takes over immediately
// ---------------------------------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// ACTIVATE — claim all clients and delete every old cache
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// FETCH
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // 1. Supabase / API calls → pure network, no caching
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/functions/') ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/auth/')
  ) {
    return; // Let the browser handle it natively
  }

  // 2. Hashed static assets (JS, CSS, fonts, images with hash in name)
  //    → CacheFirst: once cached, never re-fetch (hash guarantees freshness)
  if (HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // 3. Navigation requests (HTML / the app shell) → NetworkFirst
  //    Falls back to cached /index.html only when truly offline.
  //    index.html itself is NEVER proactively cached, so a fresh network
  //    copy is always preferred.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Do NOT cache index.html — always re-fetch from network
          return response;
        })
        .catch(() =>
          // Offline fallback: serve the last known index.html if available
          caches.match('/index.html').then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 4. Everything else (manifest, icons, etc.) → NetworkFirst with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
