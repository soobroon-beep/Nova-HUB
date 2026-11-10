// NOVA HUB · Avisos con la app CERRADA (Cloudflare Worker gratuito, cron cada minuto).
// Reemplaza al cron de GitHub Actions (check-reminders.yml), que GitHub solo corría unas pocas veces al día.
// Cada minuto:
//   1) Lee de Firestore (users/*) solo los campos reminders, routines, fcmTokens, routineNotified y tz.
//   2) Recordatorios vencidos (una vez) y bloques de horario que empiezan o terminan hoy (según repeatDays).
//   3) Manda push por Firebase Cloud Messaging (API HTTP v1) a los fcmTokens de cada usuario.
//   4) En una transacción marca lo avisado SIN reescribir tus datos: solo agrega notified:true a esos recordatorios
//      (conservando el valor exacto de todo lo demás), actualiza routineNotified y quita tokens vencidos.
// Las fechas «YYYY-MM-DDTHH:MM» (sin zona) se leen en TU zona horaria (campo tz, por defecto America/Mexico_City).
//   5) A las 8:30 (zona del usuario) genera el briefing del día con su API key de Claude (worker/briefing.mjs),
//      lo guarda en users/{uid}.briefings y avisa «Tu briefing de hoy está listo».
// Secreto del Worker: FIREBASE_SERVICE_ACCOUNT (lo sube solo .github/workflows/deploy-push-worker.yml).

import * as B from './briefing.mjs';

const TZ_DEFAULT = 'America/Mexico_City', WINDOW_MIN = 3, APP_URL = 'https://soobroon-beep.github.io/Nova-HUB/';
const FIELDS = ['reminders', 'routines', 'fcmTokens', 'routineNotified', 'tz', 'settings', 'briefings', 'briefingLock'];

/* ───────── Firestore: valores tipados ───────── */
export function decode(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = decode(x); return o; }
  return undefined;
}
const decodeFields = f => { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = decode(v); return o; };

/* ───────── Fechas en la zona del usuario ───────── */
const WD = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};
export function nowInTZ(ms, tz) {
  const p = new Intl.DateTimeFormat('en-US', {timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(ms));
  const g = t => p.find(x => x.type === t)?.value;
  return {dateStr: `${g('year')}-${g('month')}-${g('day')}`, dow: WD[g('weekday')], minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute'))};
}
const offsetMin = (ms, tz) => { // minutos que la zona va adelantada respecto a UTC en ese instante
  const p = new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(ms));
  const g = t => Number(p.find(x => x.type === t).value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(ms / 1000) * 1000) / 60000;
};
export function parseLocal(str, tz) { // «2026-11-07T10:00» = las 10:00 en tz. Con Z u offset se respeta tal cual
  if (typeof str !== 'string' || !str) return NaN;
  if (/(Z|[+-]\d\d:?\d\d)$/.test(str)) return Date.parse(str);
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?/.exec(str); if (!m) return Date.parse(str);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  let ms = asUtc - offsetMin(asUtc, tz) * 60000; ms = asUtc - offsetMin(ms, tz) * 60000; // segunda pasada por cambios de horario
  return ms;
}
const timeToMin = s => { if (typeof s !== 'string' || !s.includes(':')) return null; const [h, m] = s.split(':').map(Number); return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m; };
const repeatsToday = (b, dow) => { const rd = Array.isArray(b.repeatDays) ? b.repeatDays : [0, 1, 2, 3, 4, 5, 6]; return rd.length === 0 || rd.includes(dow); };
const isDue = (t, now) => t !== null && now >= t && now - t < WINDOW_MIN;
export const reminderKey = r => (r && r.id != null) ? 'id:' + r.id : 'dt:' + (r && r.datetime) + '|' + (r && r.title);

// Qué toca avisar ahora a un usuario (misma lógica que scripts/check-reminders.js, con la zona horaria corregida)
export function dueFor(user, nowMs) {
  let zone = typeof user.tz === 'string' && user.tz ? user.tz : TZ_DEFAULT, t;
  try { t = nowInTZ(nowMs, zone); } catch { zone = TZ_DEFAULT; t = nowInTZ(nowMs, zone); } // zona inválida → CDMX
  const log = user.routineNotified && user.routineNotified.date === t.dateStr ? new Set(user.routineNotified.keys || []) : new Set();
  const out = [];
  for (const r of Array.isArray(user.reminders) ? user.reminders : []) {
    if (!r || r.notified || !r.datetime) continue; const at = parseLocal(r.datetime, zone);
    if (Number.isFinite(at) && at <= nowMs) out.push({kind: 'rem', key: reminderKey(r), title: '⏰ NOVA HUB: ' + (r.title || 'Recordatorio'), body: r.desc || '', tag: 'rem-' + (r.id ?? r.datetime)});
  }
  for (const b of Array.isArray(user.routines) ? user.routines : []) {
    if (!b || !repeatsToday(b, t.dow)) continue;
    const s = timeToMin(b.start), e = timeToMin(b.end), ks = `${b.id}-start`, ke = `${b.id}-end`;
    if (isDue(s, t.minutes) && !log.has(ks)) out.push({kind: 'rt', key: ks, title: '▶️ NOVA HUB', body: `Comienza tu bloque "${b.title}" (${b.start} – ${b.end})`, tag: 'rt-' + ks + '-' + t.dateStr});
    if (isDue(e, t.minutes) && !log.has(ke)) out.push({kind: 'rt', key: ke, title: '⏹️ NOVA HUB', body: `Terminó tu bloque "${b.title}"`, tag: 'rt-' + ke + '-' + t.dateStr});
  }
  return {items: out, dateStr: t.dateStr};
}

// ¿Toca generar el briefing de hoy? (8:30 en la zona del usuario; reintenta hasta 3 veces dentro de la ventana)
export function briefingDue(user, nowMs) {
  let zone = typeof user.tz === 'string' && user.tz ? user.tz : TZ_DEFAULT, t;
  try { t = nowInTZ(nowMs, zone); } catch { zone = TZ_DEFAULT; t = nowInTZ(nowMs, zone); }
  const s = user.settings && typeof user.settings === 'object' ? user.settings : {};
  if (s.briefingAuto === false) return null;
  const start = timeToMin(s.briefingTime || B.BRIEFING_TIME);
  if (start === null || t.minutes < start || t.minutes >= start + B.BRIEFING_WINDOW_MIN) return null;
  if ((Array.isArray(user.briefings) ? user.briefings : []).some(e => e && e.v === B.BRIEFING_VERSION && e.date === t.dateStr)) return null;
  const apiKey = (s.aiProvider || 'claude') === 'claude' && typeof s.aiApiKey === 'string' ? s.aiApiKey.trim() : '';
  if (!apiKey) return null;
  const lock = user.briefingLock && user.briefingLock.date === t.dateStr ? user.briefingLock : null;
  if (lock && ((nowMs - Number(lock.at || 0)) < 15 * 60000 || Number(lock.tries || 0) >= 3)) return null;
  const name = (s.pixel && s.pixel.nombre) || s.username || 'Payi';
  return {zone, dateStr: t.dateStr, apiKey, name, tries: (lock ? Number(lock.tries || 0) : 0) + 1};
}

// JS → valores tipados de Firestore
export function encode(v) {
  if (v === null || v === undefined) return {nullValue: null};
  if (typeof v === 'boolean') return {booleanValue: v};
  if (typeof v === 'number') return Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v};
  if (typeof v === 'string') return {stringValue: v};
  if (Array.isArray(v)) return {arrayValue: {values: v.map(encode)}};
  if (typeof v === 'object') { const fields = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = encode(x); return {mapValue: {fields}}; }
  return {stringValue: String(v)};
}

// Cambia SOLO notified:true en los recordatorios avisados, sobre los valores tipados tal como vienen de Firestore
export function markRaw(rawReminders, keys) {
  if (!rawReminders || !rawReminders.arrayValue) return null; let changed = false;
  const values = (rawReminders.arrayValue.values || []).map(v => {
    if (!v || !v.mapValue) return v; const r = decode(v);
    if (!r || r.notified || !keys.has(reminderKey(r))) return v;
    changed = true; return {mapValue: {fields: {...(v.mapValue.fields || {}), notified: {booleanValue: true}}}};
  });
  return changed ? {arrayValue: {values}} : null;
}

/* ───────── Google OAuth con la cuenta de servicio ───────── */
const b64u = buf => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const enc = new TextEncoder();
let tokCache = null;
async function accessToken(sa, fetchFn = fetch) {
  if (tokCache && tokCache.exp - 120 > Date.now() / 1000 && tokCache.email === sa.client_email) return tokCache.tok;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000), exp = iat + 3600;
  const unsigned = b64u(enc.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'}))) + '.' + b64u(enc.encode(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp})));
  const jwt = unsigned + '.' + b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned)));
  const r = await fetchFn('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt});
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error('OAuth: ' + (j.error_description || j.error || r.status));
  tokCache = {tok: j.access_token, exp, email: sa.client_email}; return j.access_token;
}

/* ───────── ronda programada ───────── */
export async function tick(env, nowMs = Date.now(), fetchFn = fetch) {
  const sa = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) : env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa || !sa.private_key) throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT');
  const pid = sa.project_id, base = `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
  const tok = await accessToken(sa, fetchFn), H = {authorization: 'Bearer ' + tok, 'content-type': 'application/json'};
  const mask = FIELDS.map(f => 'mask.fieldPaths=' + f).join('&');
  const docs = []; let page = '';
  do {
    const r = await fetchFn(`${base}/users?pageSize=300&${mask}${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, {headers: H});
    const j = await r.json(); if (!r.ok) throw new Error('Firestore list: ' + JSON.stringify(j.error || j).slice(0, 200));
    docs.push(...(j.documents || [])); page = j.nextPageToken || '';
  } while (page);
  const stats = {users: docs.length, sent: 0, failed: 0, cleaned: 0};
  const briefJobs = [];
  for (const d of docs) {
    const user = decodeFields(d.fields), {items, dateStr} = dueFor(user, nowMs);
    const bj = briefingDue(user, nowMs); if (bj) briefJobs.push({d, user, bj});
    if (!items.length) continue;
    const tokens = (Array.isArray(user.fcmTokens) ? user.fcmTokens : []).filter(t => typeof t === 'string' && t);
    const bad = new Set();
    for (const it of items.slice(0, 10)) for (const t of tokens) {
      if (bad.has(t)) continue;
      const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {method: 'POST', headers: H, body: JSON.stringify({message: {token: t, data: {title: it.title, body: String(it.body || ''), tag: it.tag, url: APP_URL}, webpush: {headers: {Urgency: 'high', TTL: '3600'}}}})});
      if (r.ok) { stats.sent++; continue; }
      const j = await r.json().catch(() => ({})), msg = JSON.stringify(j.error || {});
      if (r.status === 404 || /UNREGISTERED|registration token/i.test(msg)) bad.add(t); else { stats.failed++; console.warn('FCM', r.status, msg.slice(0, 200)); }
    }
    await commit(base, d.name, H, fetchFn, {remKeys: new Set(items.filter(i => i.kind === 'rem').map(i => i.key)), rtKeys: items.filter(i => i.kind === 'rt').map(i => i.key), dateStr, bad});
    stats.cleaned += bad.size;
  }
  // Briefings al final: tardan ~1 min (búsquedas en la web) y no deben retrasar los avisos
  for (const {d, user, bj} of briefJobs) {
    try { if (await runBriefing(base, d.name, H, fetchFn, pid, user, bj, nowMs)) stats.briefings = (stats.briefings || 0) + 1; }
    catch (e) { console.error('briefing', e.message); stats.briefingErrors = (stats.briefingErrors || 0) + 1; }
  }
  return stats;
}

// Genera el briefing, lo guarda en users/{uid}.briefings (solo ese campo) y avisa por push
async function runBriefing(base, name, H, fetchFn, pid, user, bj, nowMs) {
  const patch = (fields) => fetchFn(`https://firestore.googleapis.com/v1/${name}?${Object.keys(fields).map(f => 'updateMask.fieldPaths=' + f).join('&')}&currentDocument.exists=true`, {method: 'PATCH', headers: H, body: JSON.stringify({fields})});
  // Candado: evita que la ronda del minuto siguiente lo genere otra vez mientras este sigue en curso
  await patch({briefingLock: encode({date: bj.dateStr, at: nowMs, tries: bj.tries})});
  const entry = await B.generateBriefing({apiKey: bj.apiKey, name: bj.name, nowMs, tz: bj.zone, fetchFn, source: 'auto'});
  const root = base.replace(/\/documents$/, '');
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    const tr = await (await fetchFn(`${root}/documents:beginTransaction`, {method: 'POST', headers: H, body: '{}'})).json();
    const g = await fetchFn(`https://firestore.googleapis.com/v1/${name}?transaction=${encodeURIComponent(tr.transaction)}&mask.fieldPaths=briefings`, {headers: H});
    const doc = await g.json(); if (!g.ok) throw new Error('Firestore get: ' + JSON.stringify(doc.error || doc).slice(0, 200));
    const list = B.addToList(decode((doc.fields || {}).briefings) || [], entry);
    const c = await fetchFn(`${root}/documents:commit`, {method: 'POST', headers: H, body: JSON.stringify({transaction: tr.transaction, writes: [{update: {name, fields: {briefings: encode(list)}}, updateMask: {fieldPaths: ['briefings']}, currentDocument: {exists: true}}]})});
    if (c.ok) { saved = true; break; }
    const e = await c.json().catch(() => ({})); if (!/ABORTED|contention/i.test(JSON.stringify(e))) throw new Error('Firestore commit: ' + JSON.stringify(e.error || e).slice(0, 200));
  }
  if (!saved) throw new Error('No se pudo guardar el briefing');
  const {title, body} = B.pushText(entry);
  for (const t of (Array.isArray(user.fcmTokens) ? user.fcmTokens : []).filter(t => typeof t === 'string' && t)) {
    await fetchFn(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {method: 'POST', headers: H, body: JSON.stringify({message: {token: t, data: {title, body, tag: 'briefing-' + entry.date, url: APP_URL + '?view=dashboard'}, webpush: {headers: {Urgency: 'high', TTL: '7200'}}}})}).catch(() => null);
  }
  return true;
}
// Transacción: vuelve a leer el documento y solo toca reminders[*].notified, routineNotified y fcmTokens
async function commit(base, name, H, fetchFn, {remKeys, rtKeys, dateStr, bad}) {
  const root = base.replace(/\/documents$/, '');
  for (let attempt = 0; attempt < 3; attempt++) {
    const tr = await (await fetchFn(`${root}/documents:beginTransaction`, {method: 'POST', headers: H, body: '{}'})).json();
    const g = await fetchFn(`https://firestore.googleapis.com/v1/${name}?transaction=${encodeURIComponent(tr.transaction)}&mask.fieldPaths=reminders&mask.fieldPaths=routineNotified&mask.fieldPaths=fcmTokens`, {headers: H});
    const doc = await g.json(); if (!g.ok) throw new Error('Firestore get: ' + JSON.stringify(doc.error || doc).slice(0, 200));
    const f = doc.fields || {}, fields = {}, paths = [];
    const rem = remKeys.size ? markRaw(f.reminders, remKeys) : null; if (rem) { fields.reminders = rem; paths.push('reminders'); }
    if (rtKeys.length) {
      const prev = decode(f.routineNotified), keys = [...new Set([...(prev && prev.date === dateStr ? prev.keys || [] : []), ...rtKeys])];
      fields.routineNotified = {mapValue: {fields: {date: {stringValue: dateStr}, keys: {arrayValue: {values: keys.map(k => ({stringValue: String(k)}))}}}}}; paths.push('routineNotified');
    }
    if (bad.size && f.fcmTokens && f.fcmTokens.arrayValue) { fields.fcmTokens = {arrayValue: {values: (f.fcmTokens.arrayValue.values || []).filter(v => !bad.has(v.stringValue))}}; paths.push('fcmTokens'); }
    if (!paths.length) { await fetchFn(`${root}/documents:rollback`, {method: 'POST', headers: H, body: JSON.stringify({transaction: tr.transaction})}); return; }
    const c = await fetchFn(`${root}/documents:commit`, {method: 'POST', headers: H, body: JSON.stringify({transaction: tr.transaction, writes: [{update: {name, fields}, updateMask: {fieldPaths: paths}, currentDocument: {exists: true}}]})});
    if (c.ok) return; const e = await c.json().catch(() => ({}));
    if (!/ABORTED|contention/i.test(JSON.stringify(e))) throw new Error('Firestore commit: ' + JSON.stringify(e.error || e).slice(0, 200));
  }
}

export default {
  async fetch() { return new Response(JSON.stringify({ok: true, app: 'NOVA HUB push', note: 'Recordatorios, horario y briefing de las 8:30 con la app cerrada (cron cada minuto)'}), {headers: {'content-type': 'application/json'}}); },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env, event.scheduledTime || Date.now()).then(r => console.log('ronda', JSON.stringify(r))).catch(e => console.error('ronda', e.message))); }
};
