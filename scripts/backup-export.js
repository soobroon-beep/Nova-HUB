// Respaldo completo y CIFRADO de Firestore (lo corre GitHub Actions cada día; lo usan Nova Hub y VORTEX).
//
// · Recorre TODAS las colecciones y subcolecciones (con la cuenta de servicio) y guarda cada documento con sus tipos
//   (fechas, referencias, bytes…) para poder restaurarlo tal cual.
// · El archivo sale cifrado con AES-256-GCM: aunque el repositorio sea público y cualquiera pueda descargar el artefacto,
//   sin la llave no se puede leer nada (tus datos y los de tus usuarios quedan privados).
// · Llave: el secreto BACKUP_KEY si existe (32 bytes en base64); si no, se deriva de la cuenta de servicio de Firebase
//   (FIREBASE_SERVICE_ACCOUNT). Si algún día cambias la cuenta de servicio, guarda la anterior para abrir respaldos viejos.
//
// Uso:  node scripts/backup-export.js <carpeta-salida>
//       EXCLUDE=candles,backups   colecciones que no se respaldan (datos públicos que se regeneran solos o copias de copias)
//       MAX_READS=20000           tope de documentos leídos (para no gastar la cuota diaria gratis de Firestore)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');

const MAGIC = Buffer.from('VXBAK1');

function saFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT');
  return JSON.parse(raw);
}
/* Llave del respaldo: BACKUP_KEY o derivada (HKDF-SHA256) de la llave privada de la cuenta de servicio */
function backupKey(sa, envKey = process.env.BACKUP_KEY) {
  if (envKey) { const k = Buffer.from(String(envKey).trim(), 'base64'); if (k.length !== 32) throw new Error('BACKUP_KEY debe ser de 32 bytes en base64'); return k; }
  if (!sa || !sa.private_key) throw new Error('Sin llave para cifrar el respaldo');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(sa.private_key), Buffer.from(String(sa.project_id || '')), Buffer.from('firestore-backup-v1'), 32));
}
function seal(obj, key) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), gz = zlib.gzipSync(Buffer.from(JSON.stringify(obj)), {level: 9});
  const ct = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
function open(buf, key) {
  if (!buf.subarray(0, 6).equals(MAGIC)) throw new Error('No es un respaldo de VORTEX/Nova Hub');
  const iv = buf.subarray(6, 18), tag = buf.subarray(18, 34), d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(34)), d.final()])).toString('utf8'));
}

/* Tipos de Firestore → JSON con etiqueta (y de vuelta) */
function enc(v, admin) {
  if (v === null || v === undefined) return v === undefined ? {$u: 1} : null;
  const F = admin.firestore;
  if (v instanceof F.Timestamp) return {$ts: [v.seconds, v.nanoseconds]};
  if (v instanceof F.GeoPoint) return {$geo: [v.latitude, v.longitude]};
  if (v instanceof F.DocumentReference) return {$ref: v.path};
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return {$b64: Buffer.from(v).toString('base64')};
  if (Array.isArray(v)) return v.map(x => enc(x, admin));
  if (typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = enc(x, admin); return o; }
  return v;
}
function dec(v, admin, db) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => dec(x, admin, db));
  const F = admin.firestore, ks = Object.keys(v);
  if (ks.length === 1) {
    if (v.$ts) return new F.Timestamp(v.$ts[0], v.$ts[1]);
    if (v.$geo) return new F.GeoPoint(v.$geo[0], v.$geo[1]);
    if (v.$ref) return db.doc(v.$ref);
    if (v.$b64) return Buffer.from(v.$b64, 'base64');
    if (v.$u) return undefined;
  }
  const o = {}; for (const [k, x] of Object.entries(v)) { const y = dec(x, admin, db); if (y !== undefined) o[k] = y; } return o;
}

async function exportAll(db, admin, {exclude = [], maxReads = 20000, log = console.log} = {}) {
  const out = {v: 1, project: db.projectId || '', at: new Date().toISOString(), docs: [], partial: false, counts: {}};
  const skip = new Set(exclude.filter(Boolean)), seen = new Set();
  async function walkCollection(col) {
    if (skip.has(col.id)) { log(`(se omite ${col.path})`); return; }
    let last = null;
    for (;;) {
      if (out.docs.length >= maxReads) { out.partial = true; return; }
      let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(300); if (last) q = q.startAfter(last);
      const snap = await q.get(); if (snap.empty) break;
      for (const d of snap.docs) {
        out.docs.push({p: d.ref.path, d: enc(d.data(), admin)}); seen.add(d.ref.path);
        const top = d.ref.path.split('/')[0]; out.counts[top] = (out.counts[top] || 0) + 1;
        for (const sub of await d.ref.listCollections()) await walkCollection(sub);
        if (out.docs.length >= maxReads) { out.partial = true; return; }
      }
      last = snap.docs[snap.docs.length - 1]; if (snap.size < 300) break;
    }
    // documentos «fantasma» (sin datos pero con subcolecciones): también se recorren
    if (col.listDocuments) for (const ref of await col.listDocuments()) {
      if (seen.has(ref.path)) continue; seen.add(ref.path);
      for (const sub of await ref.listCollections()) await walkCollection(sub);
    }
  }
  for (const col of await db.listCollections()) await walkCollection(col);
  return out;
}

async function main() {
  const dir = process.argv[2] || 'respaldo'; fs.mkdirSync(dir, {recursive: true});
  const admin = require('firebase-admin'), sa = saFromEnv();
  admin.initializeApp({credential: admin.credential.cert(sa)}); const db = admin.firestore();
  const exclude = String(process.env.EXCLUDE || '').split(',').map(s => s.trim()), maxReads = +process.env.MAX_READS || 20000;
  const data = await exportAll(db, admin, {exclude, maxReads});
  const key = backupKey(sa), file = path.join(dir, `respaldo-${sa.project_id}-${data.at.slice(0, 10)}.vxbak`);
  const box = seal(data, key); fs.writeFileSync(file, box);
  // prueba de que se puede abrir (si no, el flujo falla y te enteras)
  const back = open(fs.readFileSync(file), key); if (back.docs.length !== data.docs.length) throw new Error('El respaldo no se pudo verificar');
  const lines = [`### Respaldo de ${sa.project_id}`, `- Documentos: **${data.docs.length}**${data.partial ? ' (PARCIAL: se llegó al tope MAX_READS)' : ''}`, `- Tamaño cifrado: ${(box.length / 1024).toFixed(1)} KB`, ...Object.entries(data.counts).map(([k, n]) => `- ${k}: ${n}`), '', 'Cifrado con AES-256-GCM. Para restaurar: `node scripts/backup-restore.js <archivo> --dry-run`'];
  console.log(lines.join('\n')); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  if (data.partial) console.log('::warning::Respaldo parcial: sube MAX_READS si tienes más documentos (cuida tu cuota de Firestore).');
}

module.exports = {backupKey, seal, open, enc, dec, exportAll, MAGIC};
if (require.main === module) main().catch(e => { console.error('Respaldo falló:', e.message); process.exit(1); });
