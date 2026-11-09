/*
 * Family Christmas service worker (SPEC §9a).
 *
 * PRIVACY RULE: this worker caches ONLY things that contain no personal data:
 *   - Next.js build assets under /_next/static/ (content-hashed JS/CSS/fonts)
 *   - app icons under /icons/
 *   - the static /offline page
 * It NEVER caches page HTML, React Server Component payloads, server-action
 * responses, or anything from Supabase. Family devices are often shared, so a
 * cached page from one person must never be shown to another.
 *
 * Page navigations always go to the network; if the network is down, the
 * generic /offline page is shown instead.
 *
 * Bump VERSION when changing this file so old caches are deleted.
 */
const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

/** True only for URLs that are safe to keep (no personal data). */
function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.search !== '') return false; // query strings can carry state
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // `reload` bypasses the HTTP cache so we store fresh copies.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // server actions etc.: browser default

  const url = new URL(request.url);

  // Page loads: network only. Offline -> generic offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // Static assets: cache first, then network (and remember the answer).
  if (isCacheable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
  // Everything else (RSC payloads, /auth/*, Supabase, manifest...): not
  // intercepted at all, so the browser handles it normally.
});

// Sent by the page on logout (components/pwa.tsx): wipe every cache, then
// re-download only the static files above so the offline page keeps working.
// Replies on the MessageChannel port when done.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'clear-caches') return;
  const done = caches
    .keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => caches.open(STATIC_CACHE))
    .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
    .catch(() => {})
    .then(() => event.ports[0] && event.ports[0].postMessage('cleared'));
  event.waitUntil(done);
});
