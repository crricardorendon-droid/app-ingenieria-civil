self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('iciv-cache-v10').then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/manifest.webmanifest',
    ]))
  );
});
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
