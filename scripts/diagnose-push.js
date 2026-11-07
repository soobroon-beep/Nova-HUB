// Diagnóstico de avisos push (lo corre .github/workflows/diagnose-push.yml a mano).
// El repo es público: SOLO imprime conteos y estados — nunca títulos, textos, correos ni tokens.
const admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({credential: admin.credential.cert(sa)});
const SEND = process.env.SEND_TEST === 'true';

(async () => {
  const W = await import('../worker/reminders.mjs');
  const db = admin.firestore(), now = Date.now(), snap = await db.collection('users').get();
  console.log(`Usuarios: ${snap.size}`);
  for (const d of snap.docs) {
    const u = d.data(), id = d.id.slice(0, 4) + '…';
    const tz = u.tz || '(sin tz → CDMX)', tokens = Array.isArray(u.fcmTokens) ? u.fcmTokens : [];
    const rem = Array.isArray(u.reminders) ? u.reminders : [], zone = u.tz || 'America/Mexico_City';
    const pend = rem.filter(r => r && !r.notified && r.datetime);
    const mins = pend.map(r => Math.round((W.parseLocal(r.datetime, zone) - now) / 60000)).sort((a, b) => a - b);
    const recent = rem.filter(r => r && r.datetime && Math.abs(W.parseLocal(r.datetime, zone) - now) < 6 * 3600e3)
      .map(r => `${Math.round((W.parseLocal(r.datetime, zone) - now) / 60000)} min (notified=${!!r.notified}, formato=${String(r.datetime).length > 16 ? 'con zona/segundos' : 'local'})`);
    console.log(`\n── Usuario ${id} · tz=${tz} · fcmTokens=${tokens.length} · rutinas=${(u.routines || []).length}`);
    console.log(`   recordatorios: ${rem.length} total, ${pend.length} sin avisar; próximos sin avisar (min desde ahora): ${mins.slice(0, 8).join(', ') || '—'}`);
    console.log(`   recordatorios ±6 h: ${recent.join(' | ') || '—'}`);
    console.log(`   lo que el servidor avisaría AHORA: ${W.dueFor(u, now).items.length}`);
    console.log(`   ajustes: notificationsEnabled=${u.settings ? u.settings.notificationsEnabled : '(no está en este documento)'} · campos del doc: ${Object.keys(u).sort().join(', ')}`);
    if (SEND && tokens.length) {
      for (const [i, t] of tokens.entries()) {
        try { await admin.messaging().send({token: t, data: {title: '🧪 NOVA HUB · Prueba', body: 'Si ves esto, el push llega a tu celular ✅', tag: 'diag'}, webpush: {headers: {Urgency: 'high', TTL: '600'}}}); console.log(`   prueba → token #${i + 1}: enviado OK`); }
        catch (e) { console.log(`   prueba → token #${i + 1}: ERROR ${e.code || e.message}`); }
      }
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error('Error:', e.message); process.exit(1); });
