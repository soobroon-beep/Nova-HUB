# Push real para NOVA HUB — guía de instalación

## 0. Antes que nada: la clave admin

El JSON que me pasaste (`firebase-adminsdk...json`) **nunca va dentro del repo**, solo
como GitHub Secret (paso 3). Como ya viajó por este chat, lo ideal es que la
regeneres luego:

Firebase Console → ⚙️ Configuración del proyecto → Cuentas de servicio →
**Generar nueva clave privada** → borra la vieja. Toma 30 segundos y así
queda "limpia" de aquí en adelante.

## 1. Archivos que vas a subir al repo (mismo repo de GitHub Pages)

```
tu-repo/
├── index.html                          ← reemplaza el actual por este
├── firebase-messaging-sw.js            ← nuevo, va en la RAÍZ junto a sw.js
├── package.json                        ← nuevo
├── scripts/
│   └── check-reminders.js              ← nuevo
└── .github/
    └── workflows/
        └── check-reminders.yml         ← nuevo
```

Súbelos tal cual con `git add . && git commit -m "push real" && git push`,
o arrastrándolos en la web de GitHub.

## 2. Verifica el VAPID key

En `index.html` busca `FCM_VAPID_KEY` (cerca de la sección NOTIFICATIONS) y
confirma que sea exactamente el que copiaste de:

Firebase Console → ⚙️ Configuración del proyecto → **Cloud Messaging** →
pestaña "Certificados push web" → "Par de claves".

Si el que me pasaste es ese, ya quedó puesto. Si no, reemplázalo ahí.

## 3. Crea el secret en GitHub

En tu repo: **Settings → Secrets and variables → Actions → New repository secret**

- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: pega el **contenido completo** del archivo JSON de la cuenta de
  servicio (todo, incluyendo `{ }`).

## 4. Reglas de Firestore

Ya que mencionaste que sigues configurando Firestore en la consola — de paso,
en **Firestore → Reglas**, usa esto para que cada quien solo pueda leer/escribir
su propio documento (el Admin SDK del job de GitHub Actions ignora estas
reglas, así que no afecta al envío de push):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 5. Prueba manual

En GitHub: pestaña **Actions** → "Revisar recordatorios y enviar push" →
**Run workflow** (botón a la derecha). Revisa los logs: te dirá cuántos
usuarios revisó y cuántos recordatorios vencidos encontró.

Para probar de verdad: crea un recordatorio para "dentro de 1 minuto" en la
app, **cierra la app por completo** (no solo minimizarla), y corre el
workflow manualmente. Debería llegarte la notificación al teléfono aunque
la app esté cerrada.

## 6. Cómo queda funcionando

- El cron corre solo cada 5 minutos (`*/5 * * * *`, el mínimo que permite
  GitHub Actions) — así que un recordatorio puede tardar hasta ~5 min en
  llegar, no es instantáneo al segundo.
- Si tu repo es **público** (como suele ser para GitHub Pages gratis), los
  minutos de Actions son ilimitados. Si es **privado**, cada minuto consume
  tu cuota gratuita (2000 min/mes) — corriendo cada 5 min se gasta rápido;
  en ese caso te conviene bajar la frecuencia a `*/15 * * * *`.
- Cada dispositivo donde abras la app y aceptes notificaciones se registra
  con su propio token en `users/{tu_uid}.fcmTokens`. Tokens muertos
  (desinstalaste la PWA, etc.) se limpian solos cuando el envío falla.

## 7. Qué cambió en index.html

- Se agregó el SDK de Firebase Messaging y `arrayUnion`/`arrayRemove` de
  Firestore.
- `enableNotifications()` ahora, además de pedir permiso del navegador,
  registra un token FCM y lo guarda en tu documento de Firestore.
- Al iniciar sesión con Google, si ya tenías notificaciones activadas, el
  token se renueva solo.
- El polling local (`setInterval` cada 30s) se mantiene como respaldo para
  cuando la app está abierta — el push real es lo que cubre el caso de app
  cerrada.
