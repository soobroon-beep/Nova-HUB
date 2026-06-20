# Push real para NOVA HUB — guía de instalación

Esto ya está integrado en el código (`index.html`, `firebase-messaging-sw.js`,
`scripts/check-reminders.js`, el workflow de GitHub Actions). Lo único que
falta son 3 datos que solo tú tienes. Sin ellos, los avisos solo funcionan
con la app **abierta**; con ellos, también funcionan con la app **cerrada**
(push real vía Firebase Cloud Messaging).

## 0. La clave admin (Service Account)

El JSON que me pasaste (`firebase-adminsdk...json`) **nunca va dentro del
repo**, solo como GitHub Secret (paso 2). Como ya viajó por este chat, lo
ideal es que la regeneres luego:

Firebase Console → ⚙️ Configuración del proyecto → Cuentas de servicio →
**Generar nueva clave privada** → borra la vieja. Toma 30 segundos.

## 1. Pega tu VAPID key en index.html

En `index.html` busca `FCM_VAPID_KEY` (cerca de `window.fbSDK`, justo
después del login) y reemplaza `"PEGA_AQUI_TU_VAPID_KEY"` por la tuya:

Firebase Console → ⚙️ Configuración del proyecto → **Cloud Messaging** →
pestaña "Certificados push web" → "Par de claves" (si no existe, créala con
el botón "Generar par de claves").

## 2. Crea el secret en GitHub (para que el cron pueda enviar push)

En tu repo: **Settings → Secrets and variables → Actions → New repository
secret**

- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: pega el **contenido completo** del archivo JSON de la cuenta de
  servicio (todo, incluyendo `{ }`).

## 3. Reglas de Firestore

En **Firestore → Reglas**, usa esto para que cada quien solo pueda leer/escribir
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

## 4. Sube los cambios y prueba

```
git add . && git commit -m "push real: notas/proyectos reordenables + push de horario" && git push
```

En la app, activa el interruptor de notificaciones en Ajustes (esto pide
permiso del navegador Y registra el token de este dispositivo en Firestore,
en `users/{tu_uid}.fcmTokens`).

Para probar de verdad: crea un bloque de horario que empiece en 5-10
minutos, **cierra la app por completo** (no solo minimizarla), y espera. O,
en GitHub → pestaña **Actions** → "Revisar recordatorios y horario, enviar
push" → **Run workflow** para forzar una corrida ya mismo.

## 5. Cómo queda funcionando

- El cron corre cada 5 minutos (`*/5 * * * *`, el mínimo que permite GitHub
  Actions). Un aviso puede tardar hasta ~5-7 min en llegar, no es
  instantáneo al segundo.
- Cubre DOS cosas: tus **recordatorios sueltos** (una sola vez, a la hora
  exacta) y el **inicio y fin de cada bloque de tu horario** (todos los días
  que ese bloque se repita, según `repeatDays`).
- Si tu repo es **público** (como suele ser para GitHub Pages gratis), los
  minutos de Actions son ilimitados. Si es **privado**, cada minuto consume
  tu cuota gratuita (2000 min/mes); en ese caso conviene bajar la frecuencia
  a `*/15 * * * *` en `.github/workflows/check-reminders.yml`.
- Cada dispositivo donde abras la app y aceptes notificaciones se registra
  con su propio token. Tokens muertos (desinstalaste la PWA, etc.) se
  limpian solos cuando el envío falla. Al desactivar el interruptor, se
  intenta borrar el token de ese dispositivo.
- El polling local (cada 30s mientras la app está abierta) se mantiene como
  respaldo instantáneo; el push real es lo que cubre el caso de app cerrada.

## 6. Reordenar notas y proyectos (sin servidor, no requiere nada de esto)

En la vista de **Notas** y **Proyectos**, mantén presionada una tarjeta
~0.4s hasta que se "levante" (vibra si tu dispositivo lo soporta), y
arrástrala a la posición que quieras. El orden se guarda solo y se
sincroniza entre dispositivos igual que el resto de tus datos. Esto es
100% cliente, no depende de ningún paso de arriba.
