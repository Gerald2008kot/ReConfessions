// sw.js — Service Worker para Re-Confessions
// Estrategia: Cache-first para assets estáticos, Network-first para API/Supabase

const CACHE_NAME    = 'reconfessions-v1';
const CACHE_STATIC  = 'reconfessions-static-v1';

// Assets que se cachean en la instalación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/patch.css',
  '/js/api.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/admin.js',
  '/js/autor.js',
  '/js/buscar.js',
  '/js/chat.js',
  '/js/feed.js',
  '/js/hilos.js',
  '/js/icons.js',
  '/js/login.js',
  '/js/perfil.js',
  '/js/router.js',
  '/js/shared.js',
  '/js/upload.js',
  '/js/utils.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Dominios de red — nunca caché (Supabase, auth, realtime)
const NETWORK_ONLY_PATTERNS = [
  'supabase.co',
  'supabase.in',
  'googleapis.com',
  'accounts.google.com',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache parcial:', err))
  );
});

// ── Activate — limpiar caches viejos ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // Network-only para Supabase y dominios de autenticación
  if (NETWORK_ONLY_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-only para chrome-extension y otros esquemas no-http
  if (!url.protocol.startsWith('http')) return;

  // Archivos JS/CSS/HTML — Cache-first con fallback a red
  if (_isStaticAsset(url)) {
    event.respondWith(_cacheFirst(request));
    return;
  }

  // Imágenes — Cache-first con fallback silencioso
  if (request.destination === 'image') {
    event.respondWith(_cacheFirstSilent(request));
    return;
  }

  // Todo lo demás — Network-first con fallback a caché
  event.respondWith(_networkFirst(request));
});

// ── Estrategias ───────────────────────────────────────────────

async function _cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function _cacheFirstSilent(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Imagen no disponible offline — respuesta vacía transparente 1x1
    return new Response(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      { status: 200, headers: { 'Content-Type': 'image/gif' } }
    );
  }
}

async function _networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback a index.html para rutas SPA
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Sin conexión', { status: 503 });
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _isStaticAsset(url) {
  return (
    url.pathname.endsWith('.js')   ||
    url.pathname.endsWith('.css')  ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.woff2')||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf')
  );
}
