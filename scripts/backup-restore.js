// Restaura un respaldo cifrado de Firestore (hecho por scripts/backup-export.js).
//
//   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/backup-restore.js respaldo-xxx.vxbak --dry-run
//   … --write                      escribe TODO de vuelta (reemplaza esos documentos por la versión del respaldo)
//   … --write --only users/ABC     solo lo que empieza con esa ruta (por ejemplo, la cuenta de una persona)
//   BACKUP_KEY=...                 si el respaldo se hizo con una llave propia
// Sin --write nunca se escribe nada: solo muestra qué se restauraría.
'use strict';
const fs = require('fs');
const {backupKey, open, dec} = require('./backup-export.js');

async function main() {
  const [file, ...flags] = process.argv.slice(2); if (!file) throw new Error('Uso: node scripts/backup-restore.js <archivo.vxbak> [--dry-run|--write] [--only ruta]');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}'), data = open(fs.readFileSync(file), backupKey(sa));
  const oi = flags.indexOf('--only'), only = oi >= 0 ? String(flags[oi + 1] || '') : '', write = flags.includes('--write');
  const docs = data.docs.filter(x => !only || x.p === only || x.p.startsWith(only.replace(/\/$/, '') + '/'));
  console.log(`Respaldo de ${data.project} del ${data.at}: ${data.docs.length} documentos${data.partial ? ' (parcial)' : ''}; a restaurar: ${docs.length}`);
  if (!write) { for (const x of docs.slice(0, 40)) console.log(' ·', x.p); if (docs.length > 40) console.log(` … y ${docs.length - 40} más`); console.log('\n(prueba: no se escribió nada; agrega --write para restaurar)'); return; }
  const admin = require('firebase-admin'); admin.initializeApp({credential: admin.credential.cert(sa)}); const db = admin.firestore();
  let n = 0; for (let i = 0; i < docs.length; i += 400) { const b = db.batch(); for (const x of docs.slice(i, i + 400)) b.set(db.doc(x.p), dec(x.d, admin, db)); await b.commit(); n += Math.min(400, docs.length - i); console.log(`restaurados ${n}/${docs.length}`); }
  console.log('Listo.');
}
main().catch(e => { console.error('No se pudo restaurar:', e.message); process.exit(1); });
