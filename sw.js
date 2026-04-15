// sw.js — Re-Confessions Service Worker
// ============================================================
// Estrategia:
//   • Estáticos (CSS, JS, fuentes, iconos): Cache-first
//   • Supabase / Cloudinary API: Network-first con fallback
//   • HTML (index, login): Network-first para siempre tener la última versión
// ============================================================

const CACHE_NAME    = 'rc-static-v1';
const API_CACHE     = 'rc-api-v1';

// Recursos estáticos a pre-cachear en la instalación
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/css/app.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/feed.js',
  '/js/chat.js',
  '/js/hilos.js',
  '/js/perfil.js',
  '/js/admin.js',
  '/js/icons.js',
  '/js/shared.js',
  '/js/upload.js',
  '/js/utils.js',
  '/manifest.json',
];

// ── Install ────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        // No fallar si algún recurso no existe aún
        console.warn('[SW] Pre-cache parcial:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar extensiones de Chrome y peticiones no HTTP
  if (!url.protocol.startsWith('http')) return;

  // ── Supabase API → Network-first, sin cachear ──────────
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // ── Cloudinary → Cache-first (imágenes no cambian) ─────
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ── Google Fonts → Cache-first ─────────────────────────
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ── CDN (Supabase JS, etc.) → Cache-first ──────────────
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ── HTML pages → Network-first (siempre frescos) ───────
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // ── Estáticos locales (JS, CSS, imágenes) → Cache-first
  event.respondWith(cacheFirst(request, CACHE_NAME));
});

// ── Estrategias ────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503, statusText: 'Offline' });
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Sin conexión a internet' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Push notifications (base para futuras notificaciones) ─
self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Re-Confessions', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Re-Confessions', {
      body:    payload.body   || 'Tienes una nueva actividad.',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      tag:     payload.tag   || 'rc-notif',
      data:    payload.data  || {},
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
