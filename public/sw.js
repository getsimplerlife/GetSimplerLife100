// Service Worker v5 — Self-destruct: clears stale caches, then reloads the page once.
// v4's cache-first strategy served stale HTML/JS (with hydrateRoot → error #418)
// to returning visitors. v5: skipWaiting → clear caches → unregister → claim → reload.
// After the reload, entry-client re-registers sw.js. v5 activates again but finds
// no caches, so it unregisters without reloading — breaking the cycle.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      if (keys.length === 0) {
        // No stale caches — already cleaned up. Just unregister and exit.
        return self.registration.unregister().then(() => self.clients.claim());
      }
      // Stale caches found — clear them, unregister, then reload all open pages
      // so visitors get fresh HTML/JS without manual intervention.
      return Promise.all(keys.map(k => caches.delete(k)))
        .then(() => self.registration.unregister())
        .then(() => self.clients.claim())
        .then(() => self.clients.matchAll())
        .then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
    })
  );
});
// No fetch listener — don't intercept any requests
