// Respaldo cifrado de Firestore (scripts/backup-export.js): recorre colecciones, subcolecciones y documentos «fantasma»,
// conserva los tipos, se cifra (nadie sin la llave lo lee) y se puede abrir y restaurar igual.
const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto');
const B = require('../scripts/backup-export.js');

class Timestamp { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } }
class GeoPoint { constructor(a, b) { this.latitude = a; this.longitude = b; } }
class DocumentReference { constructor(db, p) { this.db = db; this.path = p; this.id = p.split('/').pop(); } listCollections() { return Promise.resolve(this.db.subcols(this.path)); } }
const admin = {firestore: {Timestamp, GeoPoint, DocumentReference, FieldPath: {documentId: () => '__id__'}}};

function fakeDb(store) { // store: {'ruta/doc': datos}
  const db = {projectId: 'demo', reads: 0};
  const colOf = p => p.split('/').slice(0, -1).join('/');
  db.subcols = parent => { const pre = parent ? parent + '/' : '', ids = new Set(); for (const k of Object.keys(store)) if (k.startsWith(pre)) { const rest = k.slice(pre.length).split('/'); if (rest.length >= 2) ids.add(rest[0]); } return [...ids].map(id => col(pre + id)); };
  function col(path) {
    const docsIn = () => Object.keys(store).filter(k => colOf(k) === path).sort();
    const q = (after, lim) => ({orderBy: () => q(after, lim), limit: n => q(after, n), startAfter: d => q(d.ref.path, lim),
      get: async () => { let ks = docsIn(); if (after) ks = ks.filter(k => k > after); ks = ks.slice(0, lim || 1e9); db.reads += ks.length; const docs = ks.map(k => ({ref: new DocumentReference(db, k), data: () => store[k]})); return {empty: !docs.length, size: docs.length, docs}; }});
    const o = q(null, null); o.id = path.split('/').pop(); o.path = path;
    o.listDocuments = async () => { const ids = new Set(); for (const k of Object.keys(store)) if (k.startsWith(path + '/')) ids.add(path + '/' + k.slice(path.length + 1).split('/')[0]); return [...ids].map(p => new DocumentReference(db, p)); };
    return o;
  }
  db.listCollections = async () => db.subcols('');
  db.doc = p => new DocumentReference(db, p);
  return db;
}

test('respalda todo (incluidas subcolecciones de documentos fantasma), cifrado y con sus tipos', async () => {
  const store = {
    'users/U1/data/prefs': {theme: 'dark', at: new Timestamp(1700000000, 5), where: new GeoPoint(18.8, -97.1)},
    'users/U1/data/exchanges': {box: 'v1.xxx', v: 2},
    'users/U2/data/botlab': {bots: [{id: 'b', name: 'Lucas', n: 3}], raw: Buffer.from([1, 2, 3])},
    'plans/U1': {tier: 'infinity'},
    'candles/BTCUSDT_1h': {c: [1, 2, 3]}
  };
  const db = fakeDb(store), data = await B.exportAll(db, admin, {exclude: ['candles'], log: () => {}});
  assert.deepStrictEqual(data.docs.map(x => x.p).sort(), ['plans/U1', 'users/U1/data/exchanges', 'users/U1/data/prefs', 'users/U2/data/botlab']);
  const sa = {project_id: 'demo', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'}, key = B.backupKey(sa, '');
  const box = B.seal(data, key);
  assert.ok(!box.includes(Buffer.from('infinity')) && !box.includes(Buffer.from('Lucas')), 'cifrado: no se ve nada legible');
  const back = B.open(box, key); assert.strictEqual(back.docs.length, 4);
  const prefs = B.dec(back.docs.find(x => x.p.endsWith('prefs')).d, admin, db);
  assert.ok(prefs.at instanceof Timestamp && prefs.at.seconds === 1700000000 && prefs.where instanceof GeoPoint);
  assert.deepStrictEqual([...B.dec(back.docs.find(x => x.p.endsWith('botlab')).d, admin, db).raw], [1, 2, 3]);
  assert.throws(() => B.open(box, crypto.randomBytes(32)), 'otra llave no lo abre');
  const bad = Buffer.from(box); bad[bad.length - 1] ^= 1; assert.throws(() => B.open(bad, key), 'un archivo alterado no se acepta');
  assert.strictEqual(B.backupKey(sa, '').length, 32); assert.ok(B.backupKey(sa, '').equals(B.backupKey(sa, '')), 'la llave derivada es siempre la misma');
  assert.ok(B.backupKey(sa, Buffer.alloc(32, 7).toString('base64')).equals(Buffer.alloc(32, 7)));
});

test('respeta el tope de lecturas (marca el respaldo como parcial)', async () => {
  const store = {}; for (let i = 0; i < 50; i++) store['col/d' + String(i).padStart(2, '0')] = {i};
  const data = await B.exportAll(fakeDb(store), admin, {maxReads: 20, log: () => {}});
  assert.strictEqual(data.docs.length, 20); assert.strictEqual(data.partial, true);
});
