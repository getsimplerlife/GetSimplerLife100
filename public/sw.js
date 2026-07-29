// Service Worker v3 — Network-first for navigation, cache-first for static assets
const CACHE_NAME = 'simpler-life-cache-v3';

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
    })
  );
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

  // Navigation requests (HTML pages) — NETWORK FIRST
  // This ensures users always get the latest HTML with current JS hashes
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // Cache the latest version
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: serve cached page if available
          return caches.match(e.request);
        })
    );
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
