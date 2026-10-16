/**
 * NBTC Microwave — Pre-PM Survey Control Room Service Worker
 * Provides offline caching, PWA standalone capability, and resilient network fallbacks
 *
 * Scope rules (Pre_PM2 repo policy):
 *  - ห้าม cache request ข้าม origin (api.github.com, raw.githubusercontent.com), non-GET, blob:/data:
 *  - เฉพาะ GET /api/dashboard และ /api/database เท่านั้นที่เป็น network-first + cache fallback
 *  - CACHE_NAME ผูกกับ APP_VERSION ผ่าน register('/sw.js?v=' + APP_VERSION)
 */

const SCRIPT_URL = new URL(self.location.href);
const VERSION = SCRIPT_URL.searchParams.get('v') || 'dev';
const CACHE_NAME = `pre-pm-nbtc-${VERSION}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/nbtc-logo-dashboard.png',
];

// Endpoints ที่ยอมให้ใช้ cache สำรองตอน offline ได้ (network-first)
const OFFLINE_CACHEABLE_PATHS = new Set(['/api/dashboard', '/api/database', '/database', '/dashboard']);

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
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 1. Non-GET requests (POST /api/save, /api/update, /api/delete) -> network only
  if (req.method !== 'GET') {
    return;
  }

  // 2. Cross-origin (GitHub API, raw.githubusercontent, Google Fonts, ...) -> network only
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. blob: / data: and other non-http(s) schemes -> network/browser default
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // 4. Live request markers: bypass cache entirely (must return a fresh snapshot)
  if (url.searchParams.has('_t')) {
    return;
  }

  // 5. Local API endpoints (server-only features) -> network only, never cache.
  //    /api/export-pdf, /api/sync-config, /api/github-status, ... ทำงานได้เฉพาะ local server
  const isApiPath = url.pathname.startsWith('/api/') || url.pathname === '/database' || url.pathname === '/dashboard';
  if (isApiPath && !OFFLINE_CACHEABLE_PATHS.has(url.pathname)) {
    return;
  }

  // 6. Cacheable snapshots (/api/dashboard, /api/database): Network-first, fallback to cache
  if (isApiPath) {
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

  // 7. Static Assets (fonts, CSS, JS, images): Stale-While-Revalidate / Cache-First
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
