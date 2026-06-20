// scripts/check-reminders.js
//
// Corre del lado del servidor (GitHub Actions). Usa la clave de cuenta de
// servicio (Admin SDK) — NUNCA va en el cliente/navegador — para:
//   1) Leer todos los documentos de la colección "users" en Firestore.
//   2) Revisar el array `reminders` de cada uno.
//   3) Si un recordatorio ya venció y no se ha notificado, envía un push
//      real a los `fcmTokens` guardados de ese usuario.
//   4) Marca el recordatorio como notified:true y limpia tokens inválidos.

const admin = require('firebase-admin');

function init() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error('Falta el secret FIREBASE_SERVICE_ACCOUNT');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function run() {
  const db = init();
  const now = Date.now();
  const usersSnap = await db.collection('users').get();

  console.log(`Revisando ${usersSnap.size} usuario(s)…`);

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const reminders = Array.isArray(data.reminders) ? data.reminders : [];
    const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];

    const due = reminders.filter(r => !r.notified && r.datetime && new Date(r.datetime).getTime() <= now);
    if (!due.length) continue;

    if (!tokens.length) {
      // No hay dispositivos registrados para push: solo marca como notificado
      // para no reintentar infinitamente, pero avisa en el log.
      console.log(`Usuario ${userDoc.id}: ${due.length} recordatorio(s) vencido(s) pero sin fcmTokens registrados.`);
      reminders.forEach(r => { if (due.includes(r)) r.notified = true; });
      await userDoc.ref.update({ reminders });
      continue;
    }

    const badTokenIndexes = new Set();

    for (const r of due) {
      r.notified = true;
      const message = {
        notification: {
          title: '⏰ NOVA HUB: ' + r.title,
          body: r.desc || '',
        },
        data: { reminderId: String(r.id || '') },
        tokens,
      };
      try {
        const resp = await admin.messaging().sendEachForMulticast(message);
        console.log(`Usuario ${userDoc.id} · "${r.title}" → ${resp.successCount} ok / ${resp.failureCount} fallos`);
        resp.responses.forEach((res, i) => {
          if (!res.success) {
            const code = res.error && res.error.code;
            // Tokens muertos/desinstalados: los quitamos para no acumular basura
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
              badTokenIndexes.add(i);
            } else {
              console.warn('  fallo no recuperable:', code, res.error && res.error.message);
            }
          }
        });
      } catch (e) {
        console.error(`Error enviando push a ${userDoc.id}:`, e.message);
      }
    }

    const updates = { reminders };
    if (badTokenIndexes.size) {
      const goodTokens = tokens.filter((_, i) => !badTokenIndexes.has(i));
      updates.fcmTokens = goodTokens;
      console.log(`Usuario ${userDoc.id}: limpiando ${badTokenIndexes.size} token(s) inválido(s).`);
    }
    await userDoc.ref.update(updates);
  }

  console.log('Listo.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
