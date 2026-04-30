// sw.js — Re-Confessions Service Worker
// ============================================================
// PWA: caché offline del shell de la app
// ============================================================

const CACHE_NAME    = 'rc-shell-v1';
const SHELL_ASSETS  = [
  '/',
  '/index.html',
  '/enter.html',
  '/css/app.css',
  '/css/patch.css',
  '/manifest.json',
];

// ── Install: cachear el shell ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: limpiar cachés antiguas ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network-first para API, Cache-first para shell ─────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones a Supabase, Cloudinary ni otros orígenes externos
  if (url.origin !== self.location.origin) return;

  // Para JS modules y API calls: network-first, sin caché
  if (
    url.pathname.startsWith('/js/') ||
    request.headers.get('Accept')?.includes('application/json')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Para assets del shell (CSS, HTML, manifest): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cachear respuestas exitosas del shell
        if (response.ok && SHELL_ASSETS.some(a => url.pathname === a || url.pathname.endsWith(a))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: devolver index.html para navegación
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
