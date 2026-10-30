// Service Worker for BingeLog PWA
const CACHE_NAME = 'bingelog-56f0d311-97e72e';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle requests for same origin or local app shell assets
  if (url.origin === self.location.origin) {
    // Navigation requests (including share target queries like /?share_url=...)
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const toCache = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', toCache));
          }
          return networkRes;
        }).catch(() => {
          return caches.match('/index.html').then((cached) => {
            return cached || caches.match('/') || caches.match('./index.html');
          });
        })
      );
      return;
    }

    // Static asset requests (icons, manifest, etc.): Cache-first with background stale-while-revalidate refresh
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(req).then((networkRes) => {
          if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') {
            return networkRes;
          }
          const toCache = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, toCache));
          return networkRes;
        });
      })
    );
  }
});
