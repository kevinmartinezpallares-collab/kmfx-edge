// KMFX Edge Service Worker — desactivado para evitar caché obsoleta
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});
// Sin caché — siempre red
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
