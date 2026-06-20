// scripts/check-reminders.js
//
// Corre del lado del servidor (GitHub Actions) cada 5 minutos. Usa la clave
// de cuenta de servicio (Admin SDK) — NUNCA va en el cliente/navegador — para:
//   1) Leer todos los documentos de la colección "users" en Firestore.
//   2) Revisar el array `reminders` (recordatorios sueltos, una sola vez).
//   3) Revisar el array `routines` (bloques de horario) y avisar al
//      INICIO y al FIN de cada bloque que toque hoy, según `repeatDays`.
//   4) Enviar push real a los `fcmTokens` guardados de cada usuario.
//   5) Marcar lo ya notificado y limpiar tokens inválidos.

const admin = require('firebase-admin');

const TIMEZONE = 'America/Mexico_City';
// Tolerancia de la ventana de disparo: el cron corre cada 5 min, así que
// usamos un poco más para no perder un bloque si una corrida se atrasa.
const WINDOW_MIN = 7;

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

// Fecha (YYYY-MM-DD), día de la semana (0=Dom..6=Sáb) y minutos desde
// medianoche, todo en hora de Ciudad de México, sin depender de la TZ
// del runner de GitHub Actions (que corre en UTC).
function nowInTZ() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value;
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get('hour')) % 24; // Intl puede devolver "24" a medianoche
  const minute = Number(get('minute'));
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    dow: WD[get('weekday')],
    minutes: hour * 60 + minute,
  };
}

const timeToMin = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const blockRepeatsToday = (b, dow) => {
  const rd = Array.isArray(b.repeatDays) ? b.repeatDays : [0, 1, 2, 3, 4, 5, 6];
  return rd.length === 0 ? true : rd.includes(dow);
};

// ¿El instante `target` (minutos del día) ya pasó y cae dentro de la
// ventana que cubre esta corrida del cron?
const isDue = (targetMin, nowMin) => targetMin !== null && nowMin >= targetMin && (nowMin - targetMin) < WINDOW_MIN;

async function run() {
  const db = init();
  const { dateStr, dow, minutes: nowMin } = nowInTZ();
  const nowMs = Date.now();
  const usersSnap = await db.collection('users').get();

  console.log(`Revisando ${usersSnap.size} usuario(s)… [${dateStr} ${Math.floor(nowMin / 60)}:${String(nowMin % 60).padStart(2, '0')} CDMX]`);

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    const reminders = Array.isArray(data.reminders) ? data.reminders : [];
    const routines = Array.isArray(data.routines) ? data.routines : [];
    const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];

    // Log de qué ya se notificó hoy para los bloques de horario (se
    // reinicia solo cuando cambia la fecha en CDMX).
    let routineLog = data.routineNotified && data.routineNotified.date === dateStr
      ? new Set(data.routineNotified.keys || [])
      : new Set();

    // ── 1) Recordatorios sueltos (una sola vez, sin importar fecha) ──────
    const dueReminders = reminders.filter(r => !r.notified && r.datetime && new Date(r.datetime).getTime() <= nowMs);

    // ── 2) Bloques de horario que tocan hoy: inicio y fin ────────────────
    const dueRoutines = []; // {block, edge:'start'|'end'}
    routines.forEach(b => {
      if (!blockRepeatsToday(b, dow)) return;
      const startMin = timeToMin(b.start), endMin = timeToMin(b.end);
      const startKey = `${b.id}-start`, endKey = `${b.id}-end`;
      if (isDue(startMin, nowMin) && !routineLog.has(startKey)) dueRoutines.push({ block: b, edge: 'start', key: startKey });
      if (isDue(endMin, nowMin) && !routineLog.has(endKey)) dueRoutines.push({ block: b, edge: 'end', key: endKey });
    });

    if (!dueReminders.length && !dueRoutines.length) continue;

    console.log(`Usuario ${userDoc.id}: ${dueReminders.length} recordatorio(s) vencido(s), ${dueRoutines.length} aviso(s) de horario, ${tokens.length} token(s) FCM.`);

    if (!tokens.length) {
      // No hay dispositivos registrados para push: solo marca como
      // notificado para no reintentar infinitamente, pero avisa en el log.
      dueReminders.forEach(r => { r.notified = true; });
      dueRoutines.forEach(({ key }) => routineLog.add(key));
      const updates = { reminders };
      if (dueRoutines.length) updates.routineNotified = { date: dateStr, keys: [...routineLog] };
      await userDoc.ref.update(updates);
      console.log(`Usuario ${userDoc.id}: avisos vencidos pero sin fcmTokens registrados.`);
      continue;
    }

    const badTokenIndexes = new Set();

    const sendPush = async (title, body, dataPayload) => {
      const message = { notification: { title, body }, data: dataPayload || {}, tokens };
      try {
        const resp = await admin.messaging().sendEachForMulticast(message);
        console.log(`Usuario ${userDoc.id} · "${title}" → ${resp.successCount} ok / ${resp.failureCount} fallos`);
        resp.responses.forEach((res, i) => {
          if (!res.success) {
            const code = res.error && res.error.code;
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
    };

    for (const r of dueReminders) {
      r.notified = true;
      await sendPush('⏰ NOVA HUB: ' + r.title, r.desc || '', { reminderId: String(r.id || '') });
    }

    for (const { block: b, edge, key } of dueRoutines) {
      routineLog.add(key);
      if (edge === 'start') {
        await sendPush('▶️ NOVA HUB', `Comienza tu bloque "${b.title}" (${b.start} – ${b.end})`, { routineId: String(b.id), edge });
      } else {
        await sendPush('⏹️ NOVA HUB', `Terminó tu bloque "${b.title}"`, { routineId: String(b.id), edge });
      }
    }

    const updates = { reminders };
    if (dueRoutines.length) updates.routineNotified = { date: dateStr, keys: [...routineLog] };
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
