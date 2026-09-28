/*!
 * MotoAI service worker — offline shell for the direct app / PWA.
 *
 * Strategy (versioned caches, safe cleanup, never caches models):
 *  - data/business/*.json  -> network-first, cache fallback (facts stay fresh
 *    when online, work offline after first load)
 *  - navigations           -> network-first, fallback to cached shell
 *  - same-origin static    -> cache-first + background revalidate (fast,
 *    updates within one visit — no permanent stale cache)
 *  - cross-origin requests -> untouched passthrough (WebLLM/transformers
 *    model shards are managed by the browser's own Cache API, never
 *    precached here — no huge model downloads forced on users)
 *
 * Registered ONLY in direct/PWA mode (embed mode never registers it),
 * from assets/js/pwa.js.
 */
'use strict';

const CORE_VERSION = 'v60';
const SHELL_CACHE = 'motoai-shell-' + CORE_VERSION;
const DATA_CACHE = 'motoai-data-' + CORE_VERSION;
const KNOWN_CACHES = [SHELL_CACHE, DATA_CACHE];

// Shell assets precached on install (small, app-critical, same-origin).
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css?v=60',
  './assets/js/main.js?v=60',
  './assets/js/ai-settings.js',
  './assets/js/pwa.js',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete every cache that is not the current version (safe cleanup).
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('motoai-') && !KNOWN_CACHES.includes(k))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isDataAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(new URL('data/business/', self.location.href).pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: passthrough

  // Business facts: network-first (fresh when online), cache fallback.
  if (isDataAsset(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigations: network-first. Each URL is cached under ITS OWN key so a
  // content page (e.g. /aichatbot/chinh-sach/) can NEVER overwrite the cached
  // chat homepage. Offline fallback:
  //   - the chat home URL falls back to the precached './index.html' shell;
  //   - any other URL falls back to its own cached copy (if visited before),
  //     never to the homepage.
  if (request.mode === 'navigate') {
    const isHomeRequest = url.pathname === new URL(self.registration.scope).pathname
      || url.pathname === new URL('./', self.registration.scope).pathname
      || url.pathname.endsWith('/aichatbot/');
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached
              || (isHomeRequest ? caches.match('./index.html') : null)
              || new Response('<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline — MotoAI</title><style>body{font-family:system-ui;padding:32px;text-align:center;color:#333}a{color:#4f46e5}</style></head><body><h1>Không có kết nối</h1><p>Trang này chưa được lưu để xem offline.</p><p><a href="/aichatbot/">Về màn hình Agent</a></p></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
          ))
    );
    return;
  }

  // Same-origin static assets: cache-first + background revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
