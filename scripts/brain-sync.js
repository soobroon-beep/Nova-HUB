#!/usr/bin/env node
/* NEURAL BRAIN · conector silencioso (GitHub Actions + Admin SDK).
   Mira tu cuenta en esta app (Nova Hub o VORTEX), compara con la última vez y manda al cerebro (Neural Brain)
   lo que creaste, editaste o borraste, más las actualizaciones de la app. No cambia NADA en la app.
   · Solo para cuentas que también inician sesión en Neural Brain con el mismo correo de Google.
   · Lo que hace con cada cuenta se decide en Neural Brain (Ajustes → Conexiones), no en la app.
   · En VORTEX además devuelve lo aprendido por tus cerebros de trading a users/<uid>/data/brain,
     para que la IA de VORTEX (Analizar gráfico y Briefing) lo aplique.
   · Variables: BRAIN_APP=novahub|vortex y FIREBASE_SERVICE_ACCOUNT (la cuenta de servicio de esta app, que ya tiene permiso
     «Usuario de Cloud Datastore» en el proyecto del cerebro: no hace falta otra llave). NEURAL_BRAIN_SERVICE_ACCOUNT es opcional.
     Nunca imprime datos de usuarios (el repo es público). */
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const { execSync } = require('child_process');

const TZ = 'America/Mexico_City';
const NB_PROJECT = process.env.NB_PROJECT || 'neural-brain-148a4';
const TEXT_MAX = 1500, MAX_EVENTS = 3000, FIRST_COMMITS = 40;

/* ───────── utilidades puras (probadas en tests/brain-sync.test.js) ───────── */
const hash = s => crypto.createHash('sha1').update(String(s)).digest('base64').slice(0, 12);
const clip = (s, n = TEXT_MAX) => { s = String(s == null ? '' : s).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const toMs = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : 0;
  if (typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
  const t = Date.parse(v); return Number.isNaN(t) ? 0 : t;
};
const dayOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const list = v => Array.isArray(v) ? v : [];
const lines = arr => arr.filter(x => x != null && String(x).trim() !== '').join('\n');
const tags = t => list(t).filter(Boolean).map(x => '#' + String(x).replace(/\s+/g, '_')).join(' ');
const num = v => { const n = +v; if (!Number.isFinite(n)) return ''; const a = Math.abs(n); return a >= 1000 ? n.toFixed(2) : a >= 1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : n.toPrecision(4); };

/* Un «elemento» es algo que la persona tiene guardado: {key, type, title, text, sig, at, quiet, flag, verbs}
   - sig: lo que define si cambió (si no se da, se usa title+text).
   - quiet: no genera evento al editarse (solo al crearse o borrarse), para cosas ruidosas como mover dibujos.
   - flag + verbs.flag: un estado cuyo cambio tiene un verbo propio (tarea hecha → «completó»). */
function diff(prev, items, now, first) {
  const out = [], seen = new Set(), next = {};
  for (const it of items) {
    if (!it || !it.key || seen.has(it.key)) continue; seen.add(it.key);
    const sig = hash(it.sig != null ? it.sig : (it.title || '') + '\u0001' + (it.text || '')), flag = it.flag == null ? '' : String(it.flag);
    next[it.key] = [sig, clip(it.title, 80), it.type, flag];
    const p = prev[it.key], v = it.verbs || {};
    const ev = act => ({ act, type: it.type, title: clip(it.title, 160), text: clip(it.text), ref: it.key });
    if (!p) { out.push(Object.assign(ev(first ? 'tenía' : (v.c || 'creó')), { at: first ? (it.at || now) : now })); continue; }
    if (p[3] !== flag && v.flag) { out.push(Object.assign(ev(typeof v.flag === 'function' ? v.flag(flag, p[3]) : v.flag), { at: now })); continue; }
    if (p[0] !== sig && !it.quiet) out.push(Object.assign(ev(v.u || 'editó'), { at: now }));
  }
  for (const k of Object.keys(prev)) if (!seen.has(k)) {
    const p = prev[k], d = (DELETE_VERB[p[2]] || 'borró');
    out.push({ act: d, type: p[2], title: p[1], text: '', ref: k, at: now });
  }
  return { events: out, next };
}
const DELETE_VERB = { seguimiento: 'quitó de', indicador: 'desactivó' };

/* ───────── Nova Hub: un documento users/{uid} con listas ───────── */
const dateId = x => typeof x.id === 'number' && x.id > 1e12 ? x.id : 0;
function novahubItems(d) {
  d = d || {}; const out = [];
  for (const n of list(d.notes)) if (n && n.id != null) out.push({ key: 'n:' + n.id, type: 'nota', title: n.title || clip(n.body, 60) || 'Nota', text: lines([n.title, n.body, tags(n.tags)]), at: toMs(n.createdAt) || dateId(n) });
  for (const p of list(d.projects)) {
    if (!p || p.id == null) continue;
    out.push({ key: 'p:' + p.id, type: 'proyecto', title: p.name || 'Proyecto', text: lines([p.name, p.desc, p.status ? 'Estado: ' + p.status : '']), at: toMs(p.createdAt) || dateId(p) });
    for (const t of list(p.tasks)) {
      const title = String((t && (t.title || t.text)) || '').trim(); if (!title) continue;
      out.push({ key: 't:' + p.id + ':' + hash(title.toLowerCase()), type: 'tarea', title, text: `${title}\nProyecto: ${p.name || ''}`, sig: title, flag: t.done ? 'hecha' : 'pendiente', verbs: { flag: f => f === 'hecha' ? 'completó' : 'reabrió' }, at: toMs(p.createdAt) || dateId(p) });
    }
  }
  for (const h of list(d.habits)) {
    if (!h || h.id == null) continue;
    out.push({ key: 'h:' + h.id, type: 'hábito', title: h.name || 'Hábito', text: h.name || '', at: toMs(h.createdAt) || dateId(h) });
    for (const l of list(h.logs)) { const day = typeof l === 'string' ? l.slice(0, 10) : l && (l.date || l.day) ? String(l.date || l.day).slice(0, 10) : ''; if (day) out.push({ key: 'hl:' + h.id + ':' + day, type: 'hábito cumplido', title: `${h.name || 'Hábito'} · ${day}`, text: '', verbs: { c: 'registró' }, at: toMs(day + 'T12:00:00') }); }
  }
  for (const r of list(d.reminders)) if (r && r.id != null) out.push({ key: 'r:' + r.id, type: 'recordatorio', title: r.title || 'Recordatorio', text: lines([r.title, r.desc, r.datetime ? 'Para: ' + r.datetime : '', tags(r.tags)]), sig: lines([r.title, r.desc, r.datetime]), at: toMs(r.createdAt) || dateId(r) });
  for (const e of list(d.events)) if (e && e.id != null) out.push({ key: 'e:' + e.id, type: 'evento', title: e.title || 'Evento', text: lines([e.title, [e.date, e.start && e.end ? e.start + '–' + e.end : e.start].filter(Boolean).join(' '), e.desc]), at: toMs(e.createdAt) || dateId(e) });
  for (const x of list(d.diary)) if (x && x.id != null) out.push({ key: 'd:' + x.id, type: 'diario', title: (x.mood ? x.mood + ' · ' : '') + clip(x.content || x.text, 60), text: lines([x.mood ? 'Ánimo: ' + x.mood : '', x.content || x.text]), at: toMs(x.date || x.createdAt) || dateId(x) });
  for (const r of list(d.routines)) if (r && r.id != null) out.push({ key: 'ro:' + r.id, type: 'rutina', title: r.title || 'Rutina', text: lines([r.title, [r.start, r.end].filter(Boolean).join('–'), list(r.repeatDays).length ? 'Días: ' + list(r.repeatDays).join(',') : '']), at: dateId(r) });
  return out;
}

/* ───────── VORTEX: estado (cct_mobile), scripts, bots, Claudio, diario ───────── */
function unpack(v) { // 'gz1:<base64>' o {stateZ}
  if (typeof v !== 'string') return v;
  if (v.startsWith('gz1:')) return zlib.gunzipSync(Buffer.from(v.slice(4), 'base64')).toString('utf8');
  return v;
}
function parseJSON(v) { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }
function vortexState(doc) {
  if (!doc) return {};
  if (doc.stateZ) return parseJSON(zlib.gunzipSync(Buffer.from(doc.stateZ, 'base64')).toString('utf8')) || {};
  return parseJSON(unpack(doc.state)) || {};
}
const symName = s => String(s || '').replace(/@.*$/, '');
function alertText(a) {
  const k = a.kind === 'ind' ? `indicador ${a.sname || a.sid || ''} ${a.cond || ''}`.trim() : `${a.cond || a.op || 'precio'} ${num(a.price != null ? a.price : a.level)}`;
  return clip(`${symName(a.symbol)} · ${k}${a.note ? ' · ' + a.note : ''}`, 300);
}
function drawText(key, d) {
  const pts = list(d.pts).filter(q => q && Number.isFinite(q.p)).map(q => num(q.p));
  const lab = { long: 'Posición larga (Long)', short: 'Posición corta (Short)', brush: 'Trazo a mano', text: 'Texto', fib: 'Fibonacci', hline: 'Línea horizontal', trend: 'Línea de tendencia', rect: 'Rectángulo' }[d.type] || d.type;
  const extra = d.type === 'long' || d.type === 'short' ? (pts.length ? ` · niveles ${pts.join(' / ')}` : '') : '';
  return { title: `${lab} en ${String(key).replace('|', ' ')}`, text: `${lab} en ${String(key).replace('|', ' ')}${extra}${d.text ? ' · «' + clip(d.text, 120) + '»' : ''}` };
}
function botSummary(b) {
  const v = list(b.versions).find(x => x && x.v === b.mainV) || list(b.versions).slice(-1)[0] || {};
  const sp = v.spec || {};
  const rules = JSON.stringify({ entrada: sp.entry, salida: sp.exit, riesgo: sp.risk || sp.sl || undefined }).slice(0, 900);
  return lines([`Bot «${b.name || b.id}» · ${sp.symbol || ''} ${sp.interval || ''} · versión ${b.mainV || v.v || ''}`.trim(), b.desc || b.note || '', 'Reglas: ' + rules]);
}
function resultText(name, r) {
  if (!r || typeof r !== 'object') return '';
  const m = r.monitor || r.metrics || r;
  const f = (k, l, s = '') => m[k] != null && Number.isFinite(+m[k]) ? `${l} ${(+m[k]).toFixed(2)}${s}` : '';
  return [name, r.symbol, r.interval, f('n', 'operaciones'), f('winRate', 'aciertos', '%'), f('retPct', 'retorno', '%'), f('maxDDPct', 'caída máx.', '%'), r.decision ? 'decisión: ' + r.decision : '', r.status === 'error' ? 'error: ' + r.reason : ''].filter(Boolean).join(' · ');
}
function journalText(j) {
  return lines([
    `${String(j.side || '').toUpperCase()} ${symName(j.sym)} · entrada ${num(j.entry)} → salida ${num(j.exit)} · resultado ${num(j.pnl)} USD${j.r != null && Number.isFinite(+j.r) ? ` (${(+j.r).toFixed(2)}R)` : ''}${j.lev ? ' · ' + j.lev + 'x' : ''}`,
    j.sl || j.tp ? `SL ${num(j.sl) || '—'} · TP ${num(j.tp) || '—'}` : '',
    j.why ? 'Motivo de cierre: ' + j.why : '', j.note ? 'Nota: ' + j.note : '', tags(j.tags), j.src === 'demo' ? '(cuenta demo)' : j.src ? '(' + j.src + ')' : ''
  ]);
}
function vortexItems(x) {
  const st = x.state || {}, out = [];
  const sp = parseJSON(unpack(x.scripts && x.scripts.items)), scripts = list(Array.isArray(sp) ? sp : sp && sp.items);
  const sname = sid => { const s = scripts.find(q => q && q.id === sid); return s ? s.name : String(sid || '').replace(/^(cat|free):/, ''); };
  for (const s of list(st.symbols)) out.push({ key: 'w:' + s, type: 'seguimiento', title: symName(s), text: '', verbs: { c: 'agregó a' } });
  for (const a of list(st.alerts)) if (a && a.id) out.push({ key: 'a:' + a.id, type: 'alerta', title: alertText(a), text: alertText(a), at: toMs(a.created) });
  const dr = st.drawings && typeof st.drawings === 'object' ? st.drawings : {};
  for (const k of Object.keys(dr)) for (const d of list(dr[k])) {
    if (!d || !d.id) continue; const t = drawText(k, d), ls = d.type === 'long' || d.type === 'short';
    out.push({ key: 'dr:' + k + ':' + d.id, type: ls ? 'idea de trade' : 'dibujo', title: t.title, text: t.text, quiet: !ls, verbs: { c: 'dibujó' } });
  }
  for (const [k, on] of Object.entries(st.indicators || {})) if (on === true) out.push({ key: 'i:' + k, type: 'indicador', title: k, text: '', verbs: { c: 'activó' } });
  for (const p of list(st.pine)) if (p && p.sid && p.on !== false) out.push({ key: 'pi:' + p.sid, type: 'indicador', title: sname(p.sid), text: Object.keys(p.inputs || {}).length ? 'Ajustes: ' + clip(JSON.stringify(p.inputs), 400) : '', verbs: { c: 'activó', u: 'ajustó' } });
  if (st.risk) out.push({ key: 'cfg:risk', type: 'gestión de riesgo', title: `Riesgo ${st.risk.pct}% por operación · ${st.risk.lev}x`, text: `Riesgo por operación ${st.risk.pct}% · apalancamiento ${st.risk.lev}x · comisión ${st.risk.fee}%`, verbs: { c: 'configuró', u: 'ajustó' } });
  for (const s of scripts) if (s && s.id && !s.builtin) out.push({ key: 's:' + s.id, type: 'script Pine', title: s.name || 'Script', text: lines([s.name, clip(s.code, 1200)]), sig: (s.name || '') + hash(s.code || ''), at: toMs(s.addedAt), verbs: { c: 'subió', u: 'modificó' } });
  const bots = list((parseJSON(unpack(x.botlab && x.botlab.items)) || {}).bots || parseJSON(unpack(x.botlab && x.botlab.items)));
  const bname = id => { const b = bots.find(q => q && q.id === id); return b ? b.name : id; };
  for (const b of bots) if (b && b.id) out.push({ key: 'b:' + b.id, type: 'bot', title: b.name || 'Bot', text: botSummary(b), at: toMs(b.created || b.createdAt), verbs: { c: 'creó', u: 'modificó' } });
  const res = parseJSON(unpack(x.botlabServer && x.botlabServer.results)) || (x.botlabServer && x.botlabServer.results) || {};
  if (res && typeof res === 'object') for (const [id, r] of Object.entries(res)) { const t = resultText(bname(id), r); if (t) out.push({ key: 'br:' + id, type: 'resultado de bot', title: bname(id), text: t, sig: t, verbs: { c: 'obtuvo', u: 'actualizó' } }); }
  if (x.claudioServer && x.claudioServer.summary) { const t = clip(typeof x.claudioServer.summary === 'string' ? x.claudioServer.summary : JSON.stringify(x.claudioServer.summary), 900); out.push({ key: 'cl:summary', type: 'resumen de Claudio', title: 'Claudio (bot autónomo)', text: t, verbs: { c: 'recibió', u: 'recibió' } }); }
  const jr = list(parseJSON(unpack(x.journal && x.journal.items)));
  for (const j of jr) if (j && j.id) out.push({ key: 'j:' + j.id, type: 'operación', title: `${String(j.side || '').toUpperCase()} ${symName(j.sym)} · ${num(j.pnl)} USD`, text: journalText(j), at: toMs(j.tClose || j.tOpen), verbs: { c: 'cerró', u: 'anotó en' } });
  return out;
}

/* Commits de la app = «actualizaciones». Necesita el repo con historial (fetch-depth en el workflow). */
function commitsSince(last, appName) {
  let raw = '';
  try { raw = execSync(`git log -n 400 --format=%H%x1f%ct%x1f%s`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return { events: [], head: last || '' }; }
  const all = raw.split('\n').filter(Boolean).map(l => { const [h, t, s] = l.split('\x1f'); return { h, at: +t * 1000, s }; });
  if (!all.length) return { events: [], head: last || '' };
  let pick = all; const i = last ? all.findIndex(c => c.h === last) : -1;
  if (last && i >= 0) pick = all.slice(0, i); else pick = all.slice(0, FIRST_COMMITS);
  const events = pick.filter(c => !/^Merge |^\[skip|datos? autom|news-data|dominance-data|discord-state|calendar-data/i.test(c.s))
    .map(c => ({ act: 'publicó', type: 'actualización de ' + appName, title: clip(c.s, 160), text: clip(c.s, 400), ref: 'git:' + c.h.slice(0, 10), at: c.at }));
  return { events, head: all[0].h };
}

/* Lo que tus cerebros de trading le pasan a VORTEX (un texto compacto para el prompt de su IA). */
function vortexContext(brains) {
  const parts = [];
  for (const b of brains) {
    const notes = list(b.notes).filter(n => n && String(n.text || '').trim());
    const order = n => (n.master ? 0 : ({ regla: 1, estrategia: 2, trader: 3, leccion: 4 }[n.kind] || 5));
    notes.sort((a, c) => order(a) - order(c) || (c.updatedAt || 0) - (a.updatedAt || 0));
    const block = [`### Cerebro «${b.name}»`];
    if (b.instructions) block.push('Cómo quiere que lo ayudes: ' + clip(b.instructions, 600));
    const master = notes.filter(n => n.master), rest = notes.filter(n => !n.master);
    if (master.length) block.push('REGLAS MAESTRAS (siempre aplican):\n' + master.map(n => '- ' + clip(n.text, 400)).join('\n'));
    if (rest.length) block.push('Estrategias, apuntes y lecciones:\n' + rest.slice(0, 25).map(n => `- ${n.kind ? '[' + n.kind + (n.author ? ' · ' + n.author : '') + '] ' : ''}${clip(n.text, 350)}`).join('\n'));
    if (b.learned && b.learned.text) block.push('LO QUE EL CEREBRO HA APRENDIDO DE ÉL (patrones de su forma de operar):\n' + clip(b.learned.text, 2200));
    parts.push(block.join('\n'));
  }
  return clip(parts.join('\n\n'), 7000);
}

/* ───────── ejecución con Firebase ───────── */
async function run() {
  const APP = process.env.BRAIN_APP;
  if (!['novahub', 'vortex'].includes(APP)) { console.error('BRAIN_APP debe ser novahub o vortex'); process.exit(1); }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.log('Sin FIREBASE_SERVICE_ACCOUNT: el conector no hace nada.'); return; }
  const admin = require('firebase-admin');
  const srcCred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const src = admin.initializeApp({ credential: admin.credential.cert(srcCred) }, 'src');
  const nbCred = process.env.NEURAL_BRAIN_SERVICE_ACCOUNT ? JSON.parse(process.env.NEURAL_BRAIN_SERVICE_ACCOUNT) : srcCred;
  const nb = admin.initializeApp({ credential: admin.credential.cert(nbCred), projectId: NB_PROJECT }, 'nb');
  const sdb = src.firestore(), ndb = nb.firestore();
  const appName = APP === 'novahub' ? 'Nova Hub' : 'VORTEX';

  // Las cuentas del cerebro: Neural Brain guarda tu correo en users/{uid} al iniciar sesión.
  let n = 0;
  const people = await ndb.collection('users').get();
  for (const d of people.docs) {
    const email = d.data() && d.data().email; if (!email) continue;
    try { const r = await syncUser({ uid: d.id, email }); if (r) n++; } catch (e) { console.warn('Una cuenta falló:', String(e.message || e).slice(0, 200)); }
  }
  console.log(`${appName}: ${n} cerebro(s) actualizados.`);

  async function syncUser(nbUser) {
    const uref = ndb.collection('users').doc(nbUser.uid);
    const conn = (await uref.collection('settings').doc('connections').get()).data() || {};
    if (conn[APP] === false) return false;
    let su; try { su = await src.auth().getUserByEmail(nbUser.email); } catch { return false; }
    const now = Date.now();
    let items;
    if (APP === 'novahub') {
      const d = (await sdb.collection('users').doc(su.uid).get()).data();
      if (!d) return false; items = novahubItems(d);
    } else {
      const base = sdb.collection('users').doc(su.uid).collection('data'), g = async id => (await base.doc(id).get()).data() || null;
      const [cct, scripts, botlab, botlabServer, claudioServer, journal] = await Promise.all(['cct_mobile', 'scripts', 'botlab', 'botlab_server', 'claudio_server', 'journal'].map(g));
      items = vortexItems({ state: vortexState(cct), scripts, botlab, botlabServer, claudioServer, journal });
    }
    const sref = uref.collection('sync').doc(APP), prevDoc = (await sref.get()).data() || null;
    const first = !prevDoc;
    const { events, next } = diff((prevDoc && prevDoc.h) || {}, items, now, first);
    const cm = commitsSince(prevDoc && prevDoc.commit, appName);
    const all = events.concat(cm.events).slice(-MAX_EVENTS).map(e => Object.assign(e, { app: APP, day: dayOf(e.at || now), sync: now }));
    for (let i = 0; i < all.length; i += 400) {
      const batch = ndb.batch();
      for (const e of all.slice(i, i + 400)) batch.set(uref.collection('events').doc(), e);
      await batch.commit();
    }
    await sref.set({ h: next, at: now, commit: cm.head || (prevDoc && prevDoc.commit) || '', items: Object.keys(next).length, lastEvents: all.length });
    if (all.length) await uref.collection('settings').doc('status').set({ [APP]: { at: now, events: all.length, items: Object.keys(next).length } }, { merge: true });
    else await uref.collection('settings').doc('status').set({ [APP]: { at: now, events: 0, items: Object.keys(next).length } }, { merge: true });

    if (APP === 'vortex') { // de regreso: lo que aprendieron tus cerebros de trading → la IA de VORTEX
      const bs = await uref.collection('brains').where('toVortex', '==', true).get(), brains = [];
      for (const b of bs.docs) { const notes = (await b.ref.collection('notes').get()).docs.map(x => x.data()); brains.push(Object.assign({ id: b.id }, b.data(), { notes })); }
      const text = brains.length ? vortexContext(brains) : '';
      await sdb.collection('users').doc(su.uid).collection('data').doc('brain').set({ text, brains: brains.map(b => b.name), at: now });
    }
    return true;
  }
}

if (require.main === module) run().catch(e => { console.error('Error del conector:', String(e.message || e).slice(0, 300)); process.exit(1); });
module.exports = { diff, novahubItems, vortexItems, vortexState, vortexContext, commitsSince, hash, clip, toMs, dayOf };
