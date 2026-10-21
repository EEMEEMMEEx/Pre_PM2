/**
 * NBTC Microwave — Pre-PM Survey Control Room Service Worker
 * Provides offline caching, PWA standalone capability, and resilient network fallbacks
 *
 * Scope rules (Pre_PM2 repo policy):
 *  - ห้าม cache request ข้าม origin (api.github.com, raw.githubusercontent.com), non-GET, blob:/data:
 *  - เฉพาะ GET /api/dashboard และ /api/database เท่านั้นที่เป็น network-first + cache fallback
 *  - Navigation requests: Network-First + fallback to /index.html
 *  - NOTE FOR P1: Bump CACHE_NAME version when publishing new release
 */

const SCRIPT_URL = new URL(self.location.href);
const VERSION = SCRIPT_URL.searchParams.get('v') || 'dev';
const CACHE_NAME = `pre-pm-nbtc-${VERSION}`;

// Dynamically compute base path (e.g., '/Pre_PM2' on GitHub Pages, or '' on root)
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '').replace(/\/+$/, '');

// Task C4 + GitHub Pages: Assets with base prefix support
const CORE_ASSETS = [
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/favicon.png`,
  `${BASE_PATH}/nbtc-logo-dashboard.png`,
];

// Endpoints ที่ยอมให้ใช้ cache สำรองตอน offline ได้ (network-first)
const OFFLINE_CACHEABLE_PATHS = new Set([
  '/api/dashboard',
  '/api/database',
  '/database',
  '/dashboard',
  `${BASE_PATH}/api/dashboard`,
  `${BASE_PATH}/api/database`,
]);

// Install: pre-cache application shell ทีละไฟล์เพื่อบันทึก log รายไฟล์ที่ล้มเหลวโดยไม่ throw aggregate error
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of CORE_ASSETS) {
        try {
          const res = await fetch(asset);
          if (res && res.ok) {
            await cache.put(asset, res);
          } else {
            console.warn(`[SW] Pre-cache failed for ${asset}: HTTP ${res ? res.status : 'network_error'}`);
          }
        } catch (err) {
          console.warn(`[SW] Pre-cache network exception for ${asset}:`, err);
        }
      }
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

  // 5. Navigation requests (HTML page requests): Network-First, fallback to base index.html
  if (req.mode === 'navigate') {
    const fallbackHtml = `${BASE_PATH}/index.html`;
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(fallbackHtml, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(fallbackHtml);
          return cached || caches.match(req);
        })
    );
    return;
  }

  // 6. Local API endpoints (server-only features) -> network only, never cache.
  //    /api/export-pdf, /api/sync-config, /api/github-status, ... ทำงานได้เฉพาะ local server
  const cleanPath = BASE_PATH && url.pathname.startsWith(BASE_PATH)
    ? url.pathname.slice(BASE_PATH.length)
    : url.pathname;
  const isApiPath = cleanPath.startsWith('/api/') || cleanPath === '/database' || cleanPath === '/dashboard';
  if (isApiPath && !OFFLINE_CACHEABLE_PATHS.has(url.pathname) && !OFFLINE_CACHEABLE_PATHS.has(cleanPath)) {
    return;
  }

  // 7. Cacheable snapshots (/api/dashboard, /api/database): Network-first, fallback to cache
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

  // 8. Static Assets (fonts, CSS, JS, images): Stale-While-Revalidate / Cache-First
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
