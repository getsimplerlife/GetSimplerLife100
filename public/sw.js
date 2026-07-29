// Service Worker v4 — Network-only for navigation, cache-first for static assets
// v4: NEVER cache HTML. The browser always gets fresh HTML from the server.
//     Stale HTML === stale JS hashes === broken page.
const CACHE_NAME = 'simpler-life-cache-v4';

// Static assets to pre-cache (cache-first)
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.log('SW Install error:', err))
  );
  // Immediately take control — don't wait for old SW to release
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // After clearing old caches, tell all open pages to reload
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: 4 });
        });
      });
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  
  // Skip API calls and dev tools
  if (url.pathname.startsWith('/api/') || 
      url.protocol === 'chrome-extension:' || 
      url.pathname.includes('/_telemetry') || 
      url.pathname.includes('/_tanstack') ||
      url.pathname.includes('.hot-update.')) {
    return;
  }

  // Navigation requests (HTML pages) — NETWORK ONLY, never cache
  // Even a single cached HTML page with stale JS hashes breaks the entire site.
  // The server already sends Cache-Control: no-store for HTML.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets (JS, CSS, images, fonts) — CACHE FIRST with revalidation
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidate in background
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Not cached — fetch and cache
      return fetch(e.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        return networkResponse;
      });
    })
  );
});
