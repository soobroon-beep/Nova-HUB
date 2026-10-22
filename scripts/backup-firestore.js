// scripts/backup-firestore.js
//
// Respaldo diario en la nube (GitHub Actions + Admin SDK). Para cada cuenta guarda una copia
// completa de su documento `users/{uid}` en `users/{uid}/backups/{AAAA-MM-DD}`.
//
// - Las reglas de Firestore cierran todas las subcolecciones a los clientes: solo este job
//   (Admin SDK) puede leer o escribir los respaldos, así que un bug de la app no los toca.
// - Una copia por día; se conservan las últimas KEEP_DAYS. Nunca se borra nada si hay menos de
//   MIN_KEEP respaldos, y los respaldos "grandes" (con más datos) se protegen de la rotación.
// - Si hoy hay muchos menos elementos que en el último respaldo, se avisa en el log (posible
//   borrado accidental) y el respaldo anterior queda intacto en su propio día.

const admin = require('firebase-admin');

const KEEP_DAYS = 30;
const MIN_KEEP = 7;
const TIMEZONE = 'America/Mexico_City';
const LISTS = ['notes', 'projects', 'habits', 'reminders', 'diary', 'events', 'routines', 'trash'];

function init() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error('Falta el secret FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  return admin.firestore();
}

const today = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
};

const countItems = (d) => LISTS.filter(k => k !== 'trash').reduce((n, k) => n + (Array.isArray(d[k]) ? d[k].length : 0), 0);

async function run() {
  const db = init();
  const day = today();
  const users = await db.collection('users').get();
  console.log(`Respaldando ${users.size} cuenta(s) [${day}]`);

  for (const u of users.docs) {
    const data = u.data();
    const items = countItems(data);
    const backups = u.ref.collection('backups');

    if (items === 0) { console.log(`${u.id}: sin datos reales, no se respalda (los respaldos anteriores quedan intactos).`); continue; }

    const existing = await backups.orderBy('_backupDay', 'desc').get();
    const last = existing.docs.find(d => d.id !== day);
    if (last && items < (last.data()._backupItems || 0) * 0.5) {
      console.warn(`⚠️ ${u.id}: hoy hay ${items} elementos y el último respaldo (${last.id}) tenía ${last.data()._backupItems}. Revisa si se borró algo; el respaldo anterior se conserva.`);
    }

    // Misma fecha: solo se reemplaza si hoy hay igual o más datos (no se pisa un buen respaldo del día con uno más pobre).
    const todays = existing.docs.find(d => d.id === day);
    if (todays && (todays.data()._backupItems || 0) > items) {
      await backups.doc(day + '-b').set({ ...data, _backupDay: day, _backupItems: items, _backupAt: Date.now() });
    } else {
      await backups.doc(day).set({ ...data, _backupDay: day, _backupItems: items, _backupAt: Date.now() });
    }
    console.log(`${u.id}: respaldo guardado (${items} elementos).`);

    // Rotación: se borran los más viejos que KEEP_DAYS, pero siempre quedan MIN_KEEP y el respaldo con más datos.
    const all = (await backups.orderBy('_backupDay', 'desc').get()).docs;
    if (all.length > MIN_KEEP) {
      const biggest = all.reduce((a, b) => ((b.data()._backupItems || 0) > (a.data()._backupItems || 0) ? b : a));
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
      const old = all.slice(MIN_KEEP).filter(d => d.id !== biggest.id && d.data()._backupDay < cutoff);
      for (const d of old) await d.ref.delete();
      if (old.length) console.log(`${u.id}: ${old.length} respaldo(s) antiguo(s) eliminado(s).`);
    }
  }
  console.log('Listo.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
