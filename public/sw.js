/**
 * NBTC Microwave — Pre-PM Survey Control Room Service Worker
 * Provides offline caching, PWA standalone capability, and resilient network fallbacks
 */

const CACHE_NAME = 'pre-pm-nbtc-v2.6.0';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/nbtc-logo-dashboard.png',
];

// Install: pre-cache application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core assets pre-cache partial error:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non-GET requests (e.g. POST /api/save) pass through directly to network
  if (req.method !== 'GET') {
    return;
  }

  // 1. API endpoints (/api/database, /api/dashboard): Network-first, fallback to cache
  if (url.pathname.includes('/api/') || url.pathname === '/database' || url.pathname === '/dashboard') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 2. Static Assets (fonts, CSS, JS, images): Stale-While-Revalidate / Cache-First
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
