const CACHE_NAME = 'nova-hub-v38';

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
  './maskable-512.png',
  './icon-mono-128.png',
  './icon-mono-144.png',
  './icon-mono-152.png',
  './icon-mono-167.png',
  './icon-mono-180.png',
  './icon-mono-192.png',
  './icon-mono-256.png',
  './icon-mono-384.png',
  './icon-mono-48.png',
  './icon-mono-512.png',
  './icon-mono-72.png',
  './icon-mono-96.png',
  './icon-neon-128.png',
  './icon-neon-144.png',
  './icon-neon-152.png',
  './icon-neon-167.png',
  './icon-neon-180.png',
  './icon-neon-192.png',
  './icon-neon-256.png',
  './icon-neon-384.png',
  './icon-neon-48.png',
  './icon-neon-512.png',
  './icon-neon-72.png',
  './icon-neon-96.png',
  './maskable-mono-192.png',
  './maskable-mono-512.png',
  './maskable-neon-192.png',
  './maskable-neon-512.png',
  './manifest-neon.json',
  './manifest-mono.json',
  './notif-badge-96.png',
  './pixel.js',
  './pixel.css',
  './worker/briefing.mjs',
  './worker/ai.mjs'
  // pixel-model.js y vendor/three.module.min.js (Nova Pixel 3D) se guardan solos la primera vez que lo abres
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

// ── Avisos con la app cerrada ──────────────────────────────────────────
// El Worker «nova-hub-push» (worker/reminders.mjs) manda por Firebase Cloud Messaging un mensaje de datos
// {title, body, tag, url}. Aquí se muestra la notificación (antes este SW no tenía manejador y el aviso se perdía).
// badge: el cerebro en blanco sobre transparente; Android solo usa la silueta en la barra de estado.
self.addEventListener('push', e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch (_) { p = {data: {body: e.data ? e.data.text() : ''}}; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || 'NOVA HUB', body = d.body || n.body || '';
  e.waitUntil(self.registration.showNotification(title, {
    body, tag: d.tag || undefined, renotify: false,
    icon: './icon-192.png', badge: './notif-badge-96.png', vibrate: [200, 100, 200],
    data: {url: d.url || './'}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) if ('focus' in c) { c.postMessage({type: 'nova-open', url}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
