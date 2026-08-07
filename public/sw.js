// Service Worker v5 — Self-destruct: clears all caches and unregisters
// The previous v4 cache-first strategy for JS/CSS caused stale JS bundles
// to be served even after deploys, producing hydration errors and broken pages.
// v5: Clear everything, unregister, and get out of the way.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  // Clear ALL caches
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  // Unregister this service worker
  self.registration.unregister();
  // Take control and reload any open clients
  self.clients.claim();
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.navigate(client.url));
  });
});

// No fetch listener — don't intercept any requests
