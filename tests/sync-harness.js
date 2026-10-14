// Arnés de pruebas de sincronización de NOVA HUB.
// Ejecuta el código REAL de index.html (guardado, fusión, subida, descarga, listener) en varios
// "dispositivos" (contextos aislados con su propio localStorage) contra una nube Firestore simulada.
//   node tests/sync-harness.js            → código actual
//   node tests/sync-harness.js <archivo>  → otro index.html (p. ej. una versión anterior)
'use strict';
const fs = require('fs'), vm = require('vm');

function extractSlices(html) {
  const scripts = [...html.matchAll(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/module/.test(m[1])).map(m => m[2]);
  const main = scripts.sort((a, b) => b.length - a.length)[0];
  const cut = (from, to) => { const a = main.indexOf(from); if (a < 0) throw new Error('marcador no encontrado: ' + from); const b = to ? main.indexOf(to, a) : main.length; if (b < 0) throw new Error('marcador no encontrado: ' + to); return main.slice(a, b); };
  const A_start = main.indexOf('const UNSYNCED_KEY');
  const saveStart = main.indexOf('const save = () => {');
  const saveEnd = main.indexOf('\n};', saveStart) + 3;
  const A = main.slice(A_start, saveEnd);
  const gcalHdr = main.indexOf('// GOOGLE CALENDAR (solo lectura)');
  const B = main.slice(main.indexOf('const TRASH_RETENTION_MS'), main.lastIndexOf('// ═', gcalHdr >= 0 ? gcalHdr : main.indexOf('// FIREBASE MODULE')));
  const fbHdr = main.indexOf('// FIREBASE MODULE');
  const C = main.slice(main.lastIndexOf('// ═', fbHdr), main.indexOf('// Firebase se conecta automáticamente'));
  return { A, B, C };
}

// ── Nube simulada ──────────────────────────────────────────────
function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach(k => { if (v[k] !== undefined) o[k] = sortKeys(v[k]); }); return o; } return v; }
class Cloud {
  constructor() { this.docs = {}; this.versions = {}; this.listeners = []; this.writes = 0; this.failGet = false; this.failTx = null; this.fromCache = false; this.maxBytes = 1048576; }
  _check(data) { if (Buffer.byteLength(JSON.stringify(data)) > this.maxBytes) { const e = new Error('too large'); e.code = 'invalid-argument'; throw e; } }
  _snap(path) { const d = this.docs[path]; const self = this; return { exists: () => d !== undefined, data: () => d === undefined ? undefined : sortKeys(JSON.parse(JSON.stringify(d))), metadata: { fromCache: self.fromCache, hasPendingWrites: false } }; }
  _write(path, data, merge) {
    this._check(data);
    const clone = JSON.parse(JSON.stringify(data));
    if (merge && this.docs[path]) { const cur = this.docs[path]; Object.keys(clone).forEach(k => { cur[k] = (clone[k] && typeof clone[k] === 'object' && !Array.isArray(clone[k]) && cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k])) ? { ...cur[k], ...clone[k] } : clone[k]; }); }
    else this.docs[path] = clone;
    this.versions[path] = (this.versions[path] || 0) + 1;
    (this.history = this.history || []).push(`v${this.versions[path]} por ${data._deviceId || '?'} merge=${!!merge}: ` + ['notes','projects','habits','reminders','diary'].map(k => k[0] + '[' + (data[k] || []).map(x => x.id).join(',') + ']').join(' '));
    this.writes++; this.lastWriter = (this.log = this.log || []).push(path);
    this.listeners.filter(l => l.path === path).forEach(l => l.deliver());
  }
  sdk(dev) {
    const cloud = this;
    return {
      auth: {}, db: {},
      doc: (db, col, id) => ({ path: col + '/' + id }),
      getDoc: async ref => { if (!dev.online) { const e = new Error('offline'); e.code = 'unavailable'; throw e; } if (cloud.failGet) { const e = new Error('unavailable'); e.code = 'unavailable'; throw e; } return cloud._snap(ref.path); },
      setDoc: async (ref, data, opts) => { cloud._write(ref.path, data, opts && opts.merge); },
      // Igual que Firestore: concurrencia optimista. Si el documento cambió entre la lectura y la escritura, se reintenta.
      runTransaction: async (db, fn) => {
        if (cloud.failTx) { const e = new Error(cloud.failTx); e.code = cloud.failTx; throw e; }
        for (let attempt = 0; attempt < 5; attempt++) {
          const sets = [], reads = {};
          const tx = { get: async ref => { reads[ref.path] = cloud.versions[ref.path] || 0; await new Promise(r => setImmediate(r)); (cloud.history = cloud.history || []).push(`   tx.get dev${dev.id} intento ${attempt}: leyó v${reads[ref.path]} (ahora v${cloud.versions[ref.path] || 0}) contenido=` + (cloud.docs[ref.path] ? ['notes','reminders','diary'].map(k => k[0] + '[' + (cloud.docs[ref.path][k] || []).map(x => x.id).join(',') + ']').join(' ') : 'no existe')); return cloud._snap(ref.path); }, set: (ref, data, opts) => { sets.push([ref, data, opts]); } };
          const out = await fn(tx);
          if (Object.keys(reads).every(pth => (cloud.versions[pth] || 0) === reads[pth])) { sets.forEach(([ref, data, opts]) => cloud._write(ref.path, data, opts && opts.merge)); return out; }
        }
        const e = new Error('aborted'); e.code = 'aborted'; throw e;
      },
      onSnapshot: (ref, cb) => {
        const l = { dev, path: ref.path, deliver: () => { if (!dev.online) { l.pending = true; return; } cb(cloud._snap(ref.path)); } };
        cloud.listeners.push(l); dev.listener = l;
        return () => { cloud.listeners = cloud.listeners.filter(x => x !== l); };
      },
    };
  }
}

// ── Dispositivo simulado ───────────────────────────────────────
let devCounter = 0;
function makeDevice(html, cloud, uid, ls) {
  const { A, B, C } = extractSlices(html);
  const dev = { handlers: {}, online: true, toasts: [], confirmAnswer: true, ls: ls || {}, uid, id: ++devCounter };
  const localStorage = { getItem: k => (k in dev.ls ? dev.ls[k] : null), setItem: (k, v) => { if (dev.dead) return; if (dev.quotaFail && dev.quotaFail(k)) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } dev.ls[k] = String(v); }, removeItem: k => { delete dev.ls[k]; } };
  const sandbox = {
    localStorage, console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, Promise, Set, Map, Object, Array, String, Number, Error, Buffer,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    Blob: class { constructor(p) { this.size = Buffer.byteLength(p.join('')); } },
    navigator: { get onLine() { return dev.online; } },
    document: { querySelector: () => null, getElementById: () => null, addEventListener() {}, visibilityState: 'visible' },
    window: { addEventListener(n, fn) { (dev.handlers[n] = dev.handlers[n] || []).push(fn); }, self: null, top: null }, toast: m => dev.toasts.push(m), confirm: () => dev.confirmAnswer,
    updateStats() {}, applyUsername() {}, applyAccent() {}, applyAppIcon() {}, renderSettingsView() {}, _esc: s => String(s),
    gcal: { init() {}, clear() {}, SCOPE: '' },
  };
  sandbox.window.fbSDK = cloud.sdk(dev);
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const get = k => { try { return JSON.parse(dev.ls[k] || 'null'); } catch (e) { return null; } };
  const code = `
    const DEVICE_ID = 'dev_${dev.id}';
    const state = { notes: ${JSON.stringify(get('nn_notes') || [])}, events: ${JSON.stringify(get('nn_events') || [])}, projects: ${JSON.stringify(get('nn_projects') || [])}, habits: ${JSON.stringify(get('nn_habits') || [])}, routines: ${JSON.stringify(get('nn_routines') || [])}, reminders: ${JSON.stringify(get('nn_reminders') || [])}, diary: ${JSON.stringify(get('nn_diary') || [])}, trash: ${JSON.stringify(get('nn_trash') || [])}, aiHistory: [], briefingHistory: [], settings: ${JSON.stringify(get('nn_settings') || {})} };
    ${A}
    ${B}
    ${C}
  `;
  vm.runInContext(code, ctx);
  const run = src => vm.runInContext(src, ctx);
  // Bitácora de eventos de sincronización (útil para depurar una prueba que falla)
  dev.trace = [];
  sandbox.__trace = m => dev.trace.push(m);
  try { run(`(() => {
    const ids = a => (a || []).map(x => x.id).join(',');
    const sum = o => ['notes','projects','habits','reminders','diary'].map(k => k[0] + '[' + ids(o[k]) + ']').join(' ');
    const oa = applyRemoteData; applyRemoteData = function (d) { const pre = sum(state), b = typeof getCloudBase === 'function' ? getCloudBase(fb.uid) : null; const r = oa(d); __trace('apply  local ' + pre + ' | remote ' + sum(d) + ' | after ' + sum(state) + ' | base=' + (b ? 'si' : 'no') + ' ready=' + fb.syncReady); return r; };
    const op = fb.pushAll.bind(fb); fb.pushAll = async function () { const pre = sum(state); const ready = fb.syncReady, w = !!navigator.onLine; await op(); __trace('push   ' + (ready ? '' : '(no listo, ignorado) ') + (w ? '' : '(offline) ') + 'local ' + pre + ' | despues ' + sum(state) + ' | unsynced=' + hasUnsynced()); };
    const opl = fb.pullAll.bind(fb); fb.pullAll = async function () { const r = await opl(); __trace('pull   -> ' + r + ' ready=' + fb.syncReady + ' hold=' + fb._hold + ' ' + sum(state)); return r; };
  })()`); } catch (e) { /* bitácora opcional */ }
  Object.assign(dev, {
    ctx, run,
    state: () => run('state'),
    async login() {   // equivalente al flujo de onAuthStateChanged
      await run(`(async () => {
        fb.enabled = true; fb.syncReady = false; fb._hold = false; fb.uid = ${JSON.stringify(uid)}; fb.email = 'a@b.c';
        const had = hasUnsynced();
        save();
        if (!had) localStorage.removeItem(UNSYNCED_KEY);   // igual que la app: el save() de arranque no cuenta como pendiente
        _dirtyBeforeReady = had;
        let pulled = await fb.pullAll();
        fb.startRealtimeSync();
        if (pulled && _dirtyBeforeReady) { _dirtyBeforeReady = false; schedulePush(); }
        return pulled;
      })()`);
    },
    async flush() { for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r)); await run('(async () => { clearTimeout(_pushDebounce); if (_pushPending || hasUnsynced()) { _pushPending = false; await fb.pushAll(); } })()'); },
    setOnline(v, deliver = true) { const was = dev.online; dev.online = v; if (v && !was) (dev.handlers.online || []).forEach(fn => fn()); if (v && deliver) dev.deliverPending(); },   // igual que el navegador: evento 'online'
    deliverPending() { if (dev.online && dev.listener && dev.listener.pending) { dev.listener.pending = false; dev.listener.deliver(); } },
    add(k, item) { run(`state.${k}.unshift(${JSON.stringify(item)}); save();`); },
    edit(k, id, patch) { run(`(() => { const x = state.${k}.find(x => x.id == ${JSON.stringify(id)}); Object.assign(x, ${JSON.stringify(patch)}); save(); })()`); },
    del(k, id) { const TYPE = { notes: 'note', projects: 'project', habits: 'habit', reminders: 'reminder', diary: 'diary', events: 'event', routines: 'routine' }[k]; run(`(() => { const x = state.${k}.find(x => x.id == ${JSON.stringify(id)}); addToTrash(${JSON.stringify(TYPE)}, x); state.${k} = state.${k}.filter(y => y.id != ${JSON.stringify(id)}); save(); })()`); },
    emptyTrash() { run(`state.trash = []; save();`); },
    ids(k) { return run(`state.${k}.map(x => x.id)`).slice().sort(); },
    restart() { dev.dead = true; cloud.listeners = cloud.listeners.filter(l => l.dev !== dev); return makeDevice(html, cloud, uid, dev.ls); },   // la app vieja se cierra de verdad
  });
  return dev;
}

module.exports = { makeDevice, Cloud, extractSlices };
