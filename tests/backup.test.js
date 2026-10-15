// Pruebas del respaldo (exportar / importar) de NOVA HUB.
// Ejecuta el código REAL de index.html (bloque "RESPALDO") en un contexto aislado.
//   node tests/backup.test.js            → index.html actual
//   node tests/backup.test.js <archivo>  → otro index.html
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');

const file = process.argv[2] || require('path').join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const a = html.indexOf('const BACKUP_KEY');
const b = html.indexOf('const renderSettingsView=');
if (a < 0 || b < 0) throw new Error('No encontré el bloque de respaldo en ' + file);
const block = html.slice(a, b);

const DATA_KEYS = ['notes', 'events', 'projects', 'habits', 'routines', 'reminders', 'diary', 'trash'];
function makeCtx(initial, opts = {}) {
  const store = {};
  const calls = { save: 0, toasts: [], confirms: [], downloads: [] };
  const state = Object.assign({ notes: [], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: { username: 'Payi', aiApiKey: 'sk-SECRETO', firebaseApiKey: 'otra-clave' } }, initial);
  const ctx = {
    DATA_KEYS, state, fb: { uid: 'uid123', enabled: true },
    realCounts: s => { const o = {}; DATA_KEYS.forEach(k => { o[k] = (s[k] || []).length; }); return o; },
    save: () => { calls.save++; },
    toast: m => calls.toasts.push(m),
    rerenderView: () => {}, updateStats: () => {},
    confirm: m => { calls.confirms.push(m); return opts.confirm !== false; },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: {
      querySelector: () => null,
      body: { appendChild() {} },
      createElement: () => { const el = { click() { calls.downloads.push({ href: el.href, download: el.download }); }, remove() {} }; return el; },
    },
    URL: { createObjectURL: blob => { calls.lastBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    Blob, setTimeout: () => 0, Date, JSON, Math, String, Number, Array, Set, Object, console,
  };
  vm.createContext(ctx);
  vm.runInContext(block + '\nthis.__api = { buildBackup, parseBackup, planImport, importBackupFile, downloadBackup, getLastBackup, backupStatusHtml };', ctx);
  return { api: ctx.__api, state, calls, store };
}
const fakeFile = (text, size) => ({ size: size ?? Buffer.byteLength(text), text: async () => text });

// Los arrays vienen de otro contexto vm (otro prototipo): se comparan por JSON.
const same = (x, y, msg) => assert.strictEqual(JSON.stringify(x), JSON.stringify(y), msg);

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('✅ ' + name); }
  catch (e) { fail++; console.log('❌ ' + name + '\n   ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n   ')); }
}

(async () => {
  await t('1. El respaldo NO incluye API keys y trae los datos y el conteo', () => {
    const { api } = makeCtx({ notes: [{ id: 'n1', title: 'a' }], projects: [{ id: 'p1' }] });
    const bk = api.buildBackup();
    assert.strictEqual(bk.app, 'nova-hub');
    assert.ok(!JSON.stringify(bk).includes('sk-SECRETO'), 'se coló la API key de IA');
    assert.ok(!JSON.stringify(bk).includes('otra-clave'), 'se coló la clave de Firebase');
    assert.strictEqual(bk.settings.username, 'Payi');
    assert.strictEqual(bk.data.notes.length, 1);
    assert.strictEqual(bk.counts.projects, 1);
  });

  await t('2. Exportar descarga un .json con fecha y registra la fecha del último respaldo', () => {
    const { api, calls } = makeCtx({ notes: [{ id: 'n1' }] });
    assert.strictEqual(api.getLastBackup(), 0);
    assert.ok(/Aún no/.test(api.backupStatusHtml()));
    api.downloadBackup();
    assert.strictEqual(calls.downloads.length, 1);
    assert.ok(/^nova-hub-respaldo-\d{4}-\d{2}-\d{2}\.json$/.test(calls.downloads[0].download), calls.downloads[0].download);
    assert.ok(api.getLastBackup() > 0);
    assert.ok(/hoy/.test(api.backupStatusHtml()));
  });

  await t('3. Un respaldo de hace 10 días avisa que conviene hacer otro', () => {
    const { api, store } = makeCtx({});
    store.nn_last_backup = String(Date.now() - 10 * 86400000);
    assert.ok(/hace 10 días/.test(api.backupStatusHtml()));
  });

  await t('4. Archivos inválidos se rechazan sin tocar nada', async () => {
    for (const bad of ['no es json {', '[]', '"hola"', '{}', '{"foo":1}', '{"data":{"notes":"no soy lista"}}', '{"notes":[],"projects":5}']) {
      const { api, state, calls } = makeCtx({ notes: [{ id: 'keep' }] });
      await api.importBackupFile(fakeFile(bad));
      assert.strictEqual(state.notes.length, 1, 'cambió el estado con: ' + bad);
      assert.strictEqual(calls.save, 0);
      assert.ok(calls.toasts.some(m => m.startsWith('❌')), 'sin aviso de error con: ' + bad);
    }
  });

  await t('5. Archivo gigante se rechaza', async () => {
    const { api, state, calls } = makeCtx({});
    await api.importBackupFile(fakeFile('{}', 50 * 1024 * 1024));
    assert.strictEqual(calls.save, 0); assert.strictEqual(state.notes.length, 0);
  });

  await t('6. Importar solo AÑADE lo que falta: no pisa lo existente ni duplica', async () => {
    const { api, state, calls } = makeCtx({ notes: [{ id: 'n1', title: 'LOCAL editada' }], projects: [{ id: 'p1' }] });
    const file = JSON.stringify({ app: 'nova-hub', exportedAt: '2026-10-01T00:00:00Z', data: { notes: [{ id: 'n1', title: 'vieja del respaldo' }, { id: 'n2', title: 'nueva' }], projects: [{ id: 'p1' }, { id: 'p2' }], habits: [{ id: 'h1' }] } });
    await api.importBackupFile(fakeFile(file));
    same(state.notes.map(n => n.id), ['n1', 'n2']);
    assert.strictEqual(state.notes[0].title, 'LOCAL editada', 'se pisó una nota existente');
    same(state.projects.map(p => p.id), ['p1', 'p2']);
    same(state.habits.map(h => h.id), ['h1']);
    assert.strictEqual(calls.save, 1, 'debe guardar (y por tanto subir a la nube) una vez');
    assert.ok(calls.confirms.length === 1 && /AÑADIRÁN/.test(calls.confirms[0]));
  });

  await t('7. Si dices que no en la confirmación, no cambia nada', async () => {
    const { api, state, calls } = makeCtx({}, { confirm: false });
    await api.importBackupFile(fakeFile(JSON.stringify({ data: { notes: [{ id: 'x' }] } })));
    assert.strictEqual(state.notes.length, 0); assert.strictEqual(calls.save, 0);
  });

  await t('8. Lo que está en la papelera NO se vuelve a meter', async () => {
    const { api, state } = makeCtx({ trash: [{ trashId: 't1', type: 'note', data: { id: 'borrada' }, deletedAt: new Date().toISOString() }] });
    await api.importBackupFile(fakeFile(JSON.stringify({ data: { notes: [{ id: 'borrada' }, { id: 'otra' }] } })));
    same(state.notes.map(n => n.id), ['otra']);
    assert.strictEqual(state.trash.length, 1);
  });

  await t('9. Formato viejo (state suelto) también se importa; elementos sin id se ignoran', async () => {
    const { api, state, calls } = makeCtx({});
    const old = { notes: [{ id: 1, title: 'a' }, { title: 'sin id' }, null, 7], events: [{ id: 'e1' }], settings: { aiApiKey: 'x' } };
    await api.importBackupFile(fakeFile(JSON.stringify(old)));
    same(state.notes.map(n => n.id), [1]);
    assert.strictEqual(state.events.length, 1);
    assert.ok(calls.toasts.some(m => /3 ignorados/.test(m)), calls.toasts.join('|'));
    assert.strictEqual(state.settings.aiApiKey, 'sk-SECRETO', 'el import no debe tocar los ajustes');
  });

  await t('10. Ida y vuelta: exportar y restaurar en un dispositivo vacío recupera todo', async () => {
    const src = makeCtx({ notes: [{ id: 'n1' }, { id: 'n2' }], projects: [{ id: 'p1' }], habits: [{ id: 'h1' }], reminders: [{ id: 'r1' }], diary: [{ id: 'd1' }], events: [{ id: 'e1' }], routines: [{ id: 'b1' }] });
    const text = JSON.stringify(src.api.buildBackup());
    const dst = makeCtx({});
    await dst.api.importBackupFile(fakeFile(text));
    ['notes', 'projects', 'habits', 'reminders', 'diary', 'events', 'routines'].forEach(k => same(dst.state[k], src.state[k], k));
  });

  await t('11. Importar dos veces el mismo respaldo no duplica nada', async () => {
    const { api, state, calls } = makeCtx({});
    const text = JSON.stringify({ data: { notes: [{ id: 'a' }, { id: 'b' }] } });
    await api.importBackupFile(fakeFile(text));
    await api.importBackupFile(fakeFile(text));
    assert.strictEqual(state.notes.length, 2);
    assert.strictEqual(calls.save, 1);
  });

  console.log(`\n${pass}/${pass + fail} pruebas pasaron (respaldo)`);
  process.exit(fail ? 1 : 0);
})();
