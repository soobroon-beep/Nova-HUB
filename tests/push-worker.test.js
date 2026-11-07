// Pruebas del servidor de avisos (worker/reminders.mjs): zona horaria, qué toca avisar, marcado seguro y ronda completa con Firebase simulado.
const test = require('node:test'), assert = require('node:assert');
const W = () => import('../worker/reminders.mjs');
const CDMX = 'America/Mexico_City';

test('las fechas sin zona se leen en la hora del usuario (no en UTC)', async () => {
  const w = await W();
  assert.strictEqual(new Date(w.parseLocal('2026-11-07T10:00', CDMX)).toISOString(), '2026-11-07T16:00:00.000Z');
  assert.strictEqual(new Date(w.parseLocal('2026-07-01T10:00', 'Europe/Madrid')).toISOString(), '2026-07-01T08:00:00.000Z'); // horario de verano
  assert.strictEqual(new Date(w.parseLocal('2026-11-07T10:00:00Z', CDMX)).toISOString(), '2026-11-07T10:00:00.000Z');
});

test('qué toca avisar: recordatorios vencidos y bloques de horario de hoy', async () => {
  const w = await W(), now = Date.parse('2026-11-07T16:01:00Z'); // sábado 10:01 en CDMX
  const user = {
    tz: CDMX,
    reminders: [
      {id: 1, title: 'Cita', desc: 'Tatuaje', datetime: '2026-11-07T10:00', notified: false},
      {id: 2, title: 'Futuro', datetime: '2026-11-07T10:30'},
      {id: 3, title: 'Ya avisado', datetime: '2026-11-07T09:00', notified: true},
      {id: 4, title: 'Sin fecha'}
    ],
    routines: [
      {id: 'b1', title: 'Gym', start: '10:00', end: '11:00', repeatDays: [6]},
      {id: 'b2', title: 'Domingo', start: '10:00', end: '11:00', repeatDays: [0]},
      {id: 'b3', title: 'Ya', start: '10:00', end: '10:01'},
      {id: 'b4', title: 'Viejo', start: '09:00', end: '09:30'}
    ],
    routineNotified: {date: '2026-11-07', keys: ['b3-start']}
  };
  const {items, dateStr} = w.dueFor(user, now);
  assert.strictEqual(dateStr, '2026-11-07');
  assert.deepStrictEqual(items.map(i => i.key), ['id:1', 'b1-start', 'b3-end']);
  assert.strictEqual(items[0].title, '⏰ NOVA HUB: Cita'); assert.strictEqual(items[0].tag, 'rem-1');
  assert.strictEqual(items[1].tag, 'rt-b1-start'); assert.match(items[1].body, /Comienza tu bloque "Gym" \(10:00 – 11:00\)/);
  // con el error de antes (leer en UTC) el de las 10:30 ya habría salido a las 04:30
  assert.strictEqual(w.dueFor(user, Date.parse('2026-11-07T10:31:00Z')).items.filter(i => i.kind === 'rem').length, 0);
  // zona inválida → CDMX
  assert.strictEqual(w.dueFor({...user, tz: 'Marte/Base'}, now).items.length, 3);
});

test('marcar como avisado solo agrega notified:true y conserva todo lo demás tal cual', async () => {
  const w = await W();
  const raw = {arrayValue: {values: [
    {mapValue: {fields: {id: {integerValue: '1730000000000'}, title: {stringValue: 'A'}, tags: {arrayValue: {values: [{stringValue: 'x'}]}}, color: {stringValue: '#7c6af7'}, notified: {booleanValue: false}, extra: {mapValue: {fields: {n: {doubleValue: 1.5}}}}}}},
    {mapValue: {fields: {id: {integerValue: '2'}, title: {stringValue: 'B'}}}},
    {stringValue: 'basura que no se toca'}
  ]}};
  const before = JSON.parse(JSON.stringify(raw));
  const out = w.markRaw(raw, new Set(['id:1730000000000']));
  assert.deepStrictEqual(raw, before, 'no muta el original');
  const exp = JSON.parse(JSON.stringify(before)); exp.arrayValue.values[0].mapValue.fields.notified = {booleanValue: true};
  assert.deepStrictEqual(out, exp);
  assert.strictEqual(w.markRaw(raw, new Set(['id:999'])), null, 'si no hay nada que marcar no escribe');
});

test('ronda completa: OAuth, Firestore, FCM, limpia tokens vencidos y commit acotado', async () => {
  const w = await W(), {subtle} = globalThis.crypto;
  const kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const pk = Buffer.from(await subtle.exportKey('pkcs8', kp.privateKey)).toString('base64').match(/.{1,64}/g).join('\n');
  const sa = {project_id: 'nova-hub-2a8a0', client_email: 'svc@nova.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----\n`};
  const NAME = 'projects/nova-hub-2a8a0/databases/(default)/documents/users/U1';
  const fields = {
    tz: {stringValue: CDMX},
    reminders: {arrayValue: {values: [{mapValue: {fields: {id: {integerValue: '1'}, title: {stringValue: 'Cita'}, datetime: {stringValue: '2026-11-07T10:00'}, notified: {booleanValue: false}, color: {stringValue: '#fff'}}}}]}},
    routines: {arrayValue: {values: []}},
    fcmTokens: {arrayValue: {values: [{stringValue: 'tok-ok'}, {stringValue: 'tok-gone'}]}}
  };
  const calls = [], sends = []; let commitBody = null;
  const fake = async (url, init = {}) => {
    url = String(url); calls.push(url);
    const J = (o, s = 200) => new Response(JSON.stringify(o), {status: s});
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const jwt = new URLSearchParams(init.body).get('assertion'), [h, c, sig] = jwt.split('.');
      const ok = await subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(h + '.' + c));
      const claims = JSON.parse(Buffer.from(c, 'base64url'));
      assert.ok(ok, 'JWT firmado con la cuenta de servicio'); assert.strictEqual(claims.iss, sa.client_email); assert.match(claims.scope, /datastore/); assert.match(claims.scope, /firebase\.messaging/);
      return J({access_token: 'AT', expires_in: 3600});
    }
    assert.strictEqual(init.headers && init.headers.authorization, 'Bearer AT');
    if (url.includes('/documents/users?')) { assert.match(url, /mask\.fieldPaths=reminders/); return J({documents: [{name: NAME, fields}]}); }
    if (url.includes('fcm.googleapis.com')) { const m = JSON.parse(init.body).message; sends.push(m); return m.token === 'tok-gone' ? J({error: {status: 'NOT_FOUND', details: [{errorCode: 'UNREGISTERED'}]}}, 404) : J({name: 'ok'}); }
    if (url.endsWith(':beginTransaction')) return J({transaction: 'TX'});
    if (url.includes('/users/U1?transaction=TX')) return J({name: NAME, fields});
    if (url.endsWith(':commit')) { commitBody = JSON.parse(init.body); return J({}); }
    throw new Error('llamada inesperada ' + url);
  };
  const r = await w.tick({FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa)}, Date.parse('2026-11-07T16:00:30Z'), fake);
  assert.deepStrictEqual(r, {users: 1, sent: 1, failed: 0, cleaned: 1});
  assert.deepStrictEqual(sends[0].data, {title: '⏰ NOVA HUB: Cita', body: '', tag: 'rem-1', url: 'https://soobroon-beep.github.io/Nova-HUB/'});
  assert.ok(!sends[0].notification, 'mensaje de datos: lo muestra sw.js con el badge correcto (sin duplicados)');
  const wr = commitBody.writes[0];
  assert.strictEqual(commitBody.transaction, 'TX'); assert.deepStrictEqual(wr.currentDocument, {exists: true});
  assert.deepStrictEqual(wr.updateMask.fieldPaths.sort(), ['fcmTokens', 'reminders']); // nunca toca notas, proyectos, etc.
  assert.deepStrictEqual(wr.update.fields.reminders.arrayValue.values[0].mapValue.fields.notified, {booleanValue: true});
  assert.deepStrictEqual(wr.update.fields.reminders.arrayValue.values[0].mapValue.fields.color, {stringValue: '#fff'});
  assert.deepStrictEqual(wr.update.fields.fcmTokens.arrayValue.values, [{stringValue: 'tok-ok'}]);
  // sin nada vencido: no escribe nada
  commitBody = null; calls.length = 0;
  const r2 = await w.tick({FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa)}, Date.parse('2026-11-07T15:00:00Z'), fake);
  assert.strictEqual(r2.sent, 0); assert.strictEqual(commitBody, null); assert.ok(!calls.some(u => u.includes('oauth2')), 'reutiliza el token de acceso');
});
