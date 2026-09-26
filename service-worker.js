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

const CORE_VERSION = 'v51';
const SHELL_CACHE = 'motoai-shell-' + CORE_VERSION;
const DATA_CACHE = 'motoai-data-' + CORE_VERSION;
const KNOWN_CACHES = [SHELL_CACHE, DATA_CACHE];

// Shell assets precached on install (small, app-critical, same-origin).
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/main.js',
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

  // Navigations: network-first, offline falls back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
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
