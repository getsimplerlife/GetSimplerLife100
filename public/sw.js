// Service Worker v6 — Safe cleanup: clear stale caches, unregister, NO page reloads.
// v4's cache-first strategy left stale HTML/JS in returning visitors' browsers.
// v5 attempted reload-on-activate which caused refresh loops in multi-tab scenarios.
// v6: clean caches, unregister, exit — no navigation, no reloads.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() =>
      self.registration.unregister()
    )
  );
});
// No fetch listener — don't intercept any requests
