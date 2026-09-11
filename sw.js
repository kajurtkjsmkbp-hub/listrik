const cacheName = 'kwhpulse-static-v1';
const appShell = [
  './',
  './index.html',
  './login.html',
  './dashboard.html',
  './rekapan.html',
  './tarif.html',
  './styles.css',
  './script.js?v=10',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(cacheName).then(cache => cache.addAll(appShell))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== cacheName).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(response => {
        const responseClone = response.clone();
        caches.open(cacheName).then(cache => cache.put(event.request, responseClone));
        return response;
      });
    })
  );
});
