// firebase-messaging-sw.js
// Service Worker DEDICADO a Firebase Cloud Messaging.
// Se registra con su propio scope ('/firebase-cloud-messaging-push-scope')
// para no chocar con tu sw.js principal (el de caché/PWA).
//
// Este archivo debe vivir en la RAÍZ del sitio (mismo nivel que index.html),
// junto a sw.js y manifest.json.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Misma config pública que usas en index.html (no es secreta, es la config
// de cliente de Firebase; la clave que SÍ es secreta es la del Admin SDK,
// esa nunca va aquí ni en ningún archivo del repo).
firebase.initializeApp({
  apiKey: "AIzaSyAACWtwcJayD3q_LIC7gL6QoY1H7dfaEjY",
  authDomain: "nova-hub-2a8a0.firebaseapp.com",
  projectId: "nova-hub-2a8a0",
  storageBucket: "nova-hub-2a8a0.firebasestorage.app",
  messagingSenderId: "438215534612",
  appId: "1:438215534612:web:d4d3243352d19bfc9d5f01",
});

const messaging = firebase.messaging();

// Se dispara cuando llega un push y la app NO está en primer plano
// (pestaña cerrada, minimizada, o de plano la app no está abierta).
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'NOVA HUB';
  const body  = (payload.notification && payload.notification.body)  || (payload.data && payload.data.body)  || '';

  self.registration.showNotification(title, {
    body,
    icon: 'icon-192.png',
    badge: 'icon-96.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.reminderId) || undefined,
  });
});

// Al tocar la notificación, enfoca o abre la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
