const CACHE_NAME = 'simpler-life-cache-v3';

// Only cache static assets — NEVER cache HTML pages
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // Never intercept API calls, extension traffic, or dev tools
  if (url.includes('/api/') || url.includes('chrome-extension') || url.includes('/_telemetry') || url.includes('ws') || url.includes('/_tanstack') || url.includes('.hot-update.')) {
    return;
  }

  // Navigation requests (HTML pages): ALWAYS go to network, never cache
  if (e.request.mode === 'navigate') {
    return; // Let the browser handle it normally — no SW caching
  }

  // For static assets: cache-first, network fallback
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Update cache in background
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
