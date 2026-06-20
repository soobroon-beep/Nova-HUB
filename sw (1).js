const CACHE_NAME = 'nova-hub-v2';

// Rutas relativas: funcionan sin importar si el sitio vive en la raíz
// del dominio o en una subcarpeta (como github.io/Nova-HUB/).
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-48.png',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-167.png',
  './icon-180.png',
  './icon-192.png',
  './icon-256.png',
  './icon-384.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './maskable-192.png',
  './maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.error('[SW] Error al cachear assets iniciales:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Solo manejamos GET de nuestro propio origen. Todo lo demás (Firebase,
  // Google Auth, APIs externas) pasa de largo sin que el SW lo toque.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navegación (abrir/recargar la app): primero red para tener la versión
  // más reciente; si no hay conexión, cae al index.html cacheado.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resto de archivos (íconos, manifest): caché primero, red de respaldo,
  // y guarda en caché lo nuevo que vaya apareciendo.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
