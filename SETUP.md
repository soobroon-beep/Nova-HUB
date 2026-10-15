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

## 3. Reglas de Firestore (ya versionadas en el repo: `firestore.rules`)

Las reglas viven en `firestore.rules`. Hacen esto:

- Cada cuenta solo puede **leer y escribir su propio documento** `users/{uid}`. Otra cuenta, o alguien sin sesión, no puede ni leerlo.
- Nadie puede **borrar** el documento completo desde un cliente (la app nunca lo hace): protege contra un borrado accidental de todos tus datos.
- Cada sección (`notes`, `projects`, `habits`, `reminders`, `diary`, `events`, `routines`, `trash`, `fcmTokens`) tiene que ser una lista y `settings` un mapa; `_uid`, si viene, debe ser el de la cuenta. Así un bug no puede dejar "notes" como texto y romper la app en todos tus dispositivos.
- Todo lo demás (otras colecciones, subcolecciones) está cerrado.
- El Admin SDK del job de GitHub Actions ignora estas reglas, así que el envío de push no se ve afectado.

**Cómo aplicarlas** (una de dos; el repo NO las despliega solo):

1. **Consola (lo más simple):** Firebase Console → Firestore Database → **Reglas** → pega el contenido de `firestore.rules` → **Publicar**. La consola avisa si hay un error de sintaxis y no publica nada roto.
2. **CLI:** `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules` (usa `firebase.json` y `.firebaserc`, proyecto `nova-hub-2a8a0`).

**Cómo comprobar que quedaron bien** (en la consola, pestaña Reglas → **Simulador de reglas**):

- Lectura de `users/TU_UID` autenticado como tú → **permitido**.
- Lectura de `users/TU_UID` autenticado como OTRO uid, o sin autenticar → **denegado**.
- Eliminar `users/TU_UID` → **denegado**.

Después, abre Nova Hub, inicia sesión, crea una nota y mira que diga "Sincronizado ✓" (toca el indicador de la barra lateral para ver el detalle). Si algo fallara, aparece "Error al subir" y tus datos siguen guardados en el dispositivo.

`tests/rules.test.js` contiene 16 pruebas de estas reglas contra el emulador de Firestore (necesitan Java; instrucciones en el encabezado del archivo).

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

## 7. Sincronización segura (por qué ya no se pierden datos) y cómo probarlo

Todo se guarda en UN documento por cuenta: `users/{uid}`. Reglas que cumple el código:

- **Nada se sube hasta confirmar la descarga** de la nube. Si la descarga falla o llega solo de caché, no se escribe nada.
- **Subir = fusionar, no reemplazar.** Cada subida es una transacción: lee la nube, fusiona elemento por elemento
  (3 vías, comparando con la última versión de la nube que ese dispositivo vio) y escribe. Lo nuevo de otro dispositivo
  nunca se borra por subir desde uno atrasado o que estuvo sin internet.
- **Solo se borra lo que alguien borró a propósito** (va a la papelera, que lo conserva 5 días). Si algo se editó en un
  dispositivo y se borró en otro, gana la edición.
- Si una misma cosa se edita en 2 dispositivos a la vez, gana la más reciente y la otra versión queda en `nn_conflicts` (local).
- Sin internet no se intenta subir: todo queda guardado en el dispositivo con una marca de "pendiente" que sobrevive a cerrar la app.
- Si los datos superan ~1 MB (límite de Firestore por documento) **no se sube** y la app avisa claro; nada se borra.
- Los datos de otra cuenta de Google en el mismo dispositivo no se mezclan con la cuenta nueva (quedan en una copia local).

Pruebas automáticas (ejecutan el código real de `index.html` contra una nube Firestore simulada):

```
npm run test:sync                          # o: node tests/sync.test.js
FUZZ_SEED=42 FUZZ_RUNS=2000 npm run test:sync   # más secuencias aleatorias
TRACE=1 npm run test:sync                  # si algo falla, imprime la bitácora de cada dispositivo
```

## 8. App Check (opcional, recomendado): que solo TU app hable con tu Firebase

Las reglas protegen *qué* datos puede tocar cada cuenta; App Check además verifica que la petición viene de la app de verdad y no de un script ajeno. Está **apagado** hasta que pegues una clave, así que no cambia nada hoy.

1. Entra a https://www.google.com/recaptcha/admin → **Crear** → tipo **reCAPTCHA v3** → dominio `soobroon-beep.github.io` → copia la **clave del sitio** y la **clave secreta**.
2. Firebase Console → **App Check** → pestaña Apps → tu app web → **reCAPTCHA** → pega la **clave secreta** → Guardar.
3. En `index.html` busca `APP_CHECK_SITE_KEY` y pega la **clave del sitio** entre las comillas. Sube el cambio.
4. Abre la app unos días y revisa en App Check → **Solicitudes** que casi todo aparezca como "verificado".
5. Solo entonces, en App Check → **Firestore** (y Authentication, si quieres) pulsa **Aplicar**. **No lo apliques antes del paso 4**: con la imposición activa, una clave mal pegada o un dominio faltante dejaría la app sin poder guardar en la nube.

## 9. Respaldo (Ajustes → 📦 Datos)

- **Exportar respaldo:** descarga `nova-hub-respaldo-AAAA-MM-DD.json` con todos tus datos. No incluye tus API keys. Ajustes muestra la fecha del último respaldo y avisa si pasaron 7 días o más.
- **Importar respaldo:** solo **añade** lo que falta (compara por id). Nunca reemplaza ni borra lo que ya tienes, y lo que está en la papelera no se vuelve a meter. Acepta también los archivos del formato anterior (`nova-hub-backup.json`). Lo importado se sube a la nube como cualquier otro cambio.
- Toca el indicador de sincronización (barra lateral) para ver cuándo fue la última subida, cuánto ocupan tus datos y si hay cambios pendientes.

Pruebas automáticas del respaldo: `npm run test:backup`. Todas las pruebas: `npm test`.
