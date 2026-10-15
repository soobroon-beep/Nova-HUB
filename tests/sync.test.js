'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { makeDevice, Cloud } = require('./sync-harness');
const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const UID = 'user1';
const note = (id, extra) => ({ id, title: 'nota ' + id, content: 'x', ...extra });
const results = [];
async function t(name, fn) { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message.split("\n").slice(0, 12).join(" | ")]); } }
const sameSet = (a, b) => assert.deepStrictEqual([...a].sort(), [...b].sort());
const cloudIds = (cloud, k) => (cloud.docs['users/' + UID][k] || []).map(x => x.id).sort();

(async () => {
  await t('1. Dos dispositivos: lo que crea uno aparece en el otro', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(101)); await A.flush();
    await B.login(); sameSet(B.ids('notes'), [101]);
    B.add('notes', note(102)); await B.flush();
    sameSet(A.ids('notes'), [101, 102]); sameSet(cloudIds(cloud, 'notes'), [101, 102]);
  });

  await t('1b. Cuenta de Google distinta en el mismo dispositivo: los datos de una NO pasan a la otra', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(901)); A.add('diary', { id: 902, content: 'privado' }); await A.flush();
    const B = makeDevice(html, cloud, 'user2', A.ls);      // otra persona inicia sesión en este mismo teléfono
    await B.login(); await B.flush();
    sameSet(B.ids('notes'), []); sameSet(B.ids('diary'), []);
    const d2 = cloud.docs['users/user2'] || {};
    assert.deepStrictEqual((d2.notes || []).map(x => x.id), []); assert.deepStrictEqual((d2.diary || []).map(x => x.id), []);
    sameSet(cloudIds(cloud, 'notes'), [901]);                // la cuenta original queda intacta
  });

  await t('2. Dispositivo atrasado/sin internet NO borra lo que creaste en otro (el bug principal)', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); await A.flush(); await B.login();
    B.setOnline(false); B.add('notes', note(3));            // B sin internet crea la 3
    A.add('notes', note(2)); await A.flush();                 // A crea la 2 y sube
    B.setOnline(true); await B.flush();                       // B reconecta y sube
    sameSet(cloudIds(cloud, 'notes'), [1, 2, 3]); sameSet(A.ids('notes'), [1, 2, 3]); sameSet(B.ids('notes'), [1, 2, 3]);
  });

  await t('2b. Igual, pero el dispositivo atrasado sube ANTES de recibir lo nuevo (carrera al reconectar)', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); await A.flush(); await B.login();
    B.setOnline(false); B.add('notes', note(3));
    A.add('notes', note(2)); await A.flush();
    B.setOnline(true, false); await B.flush(); B.deliverPending();   // sube primero, el aviso de la nube llega después
    sameSet(cloudIds(cloud, 'notes'), [1, 2, 3]); sameSet(A.ids('notes'), [1, 2, 3]); sameSet(B.ids('notes'), [1, 2, 3]);
  });

  await t('3. Un borrado a propósito se propaga y no resucita', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); A.add('notes', note(2)); await A.flush(); await B.login();
    A.del('notes', 1); await A.flush();
    sameSet(B.ids('notes'), [2]);
    B.add('notes', note(5)); await B.flush();
    sameSet(cloudIds(cloud, 'notes'), [2, 5]);
    assert.strictEqual(cloud.docs['users/' + UID].trash.length, 1);
  });

  await t('4. Dispositivo viejo con una nota ya borrada (y papelera vaciada) no la hace resucitar', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); A.add('notes', note(2)); await A.flush(); await B.login();
    B.setOnline(false); B.add('notes', note(9));
    A.del('notes', 1); A.emptyTrash(); await A.flush();
    B.setOnline(true); await B.flush();
    sameSet(cloudIds(cloud, 'notes'), [2, 9]);
  });

  await t('5. Editar algo que otro dispositivo borró: la edición se conserva (nunca se pierde trabajo)', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); await A.flush(); await B.login();
    B.setOnline(false); B.edit('notes', 1, { content: 'editado sin internet' });
    A.del('notes', 1); await A.flush();
    B.setOnline(true); await B.flush();
    assert.ok(cloudIds(cloud, 'notes').includes(1));
  });

  await t('6. Se editó lo mismo en 2 dispositivos: gana el más reciente y la otra versión se guarda', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); await A.flush(); await B.login();
    B.setOnline(false); B.edit('notes', 1, { content: 'de B', updatedAt: 1000 });
    A.edit('notes', 1, { content: 'de A', updatedAt: 2000 }); await A.flush();
    B.setOnline(true); await B.flush();
    assert.strictEqual(cloud.docs['users/' + UID].notes.find(n => n.id === 1).content, 'de A');
    assert.ok(JSON.parse(B.ls['nn_conflicts'] || '[]').some(c => c.lost.content === 'de B'));
  });

  await t('7. Nube vacía + este dispositivo con datos: no se borra nada sin preguntar', async () => {
    const cloud = new Cloud(); cloud.docs['users/' + UID] = { notes: [], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    const B = makeDevice(html, cloud, UID); B.add('notes', note(7)); B.confirmAnswer = false;
    await B.login(); sameSet(B.ids('notes'), [7]); assert.strictEqual(cloud.writes, 0);
    const B2 = makeDevice(html, cloud, UID, { ...B.ls }); B2.confirmAnswer = true; await B2.login(); await B2.flush();
    sameSet(cloudIds(cloud, 'notes'), [7]);
  });

  await t('8. Si la descarga falla o llega solo de caché, no se sube nada', async () => {
    const cloud = new Cloud(); cloud.docs['users/' + UID] = { notes: [note(1)], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    const B = makeDevice(html, cloud, UID); B.add('notes', note(8)); cloud.failGet = true; await B.login(); B.add('notes', note(9)); await B.flush();
    sameSet(cloudIds(cloud, 'notes'), [1]); assert.strictEqual(cloud.writes, 0);
    cloud.failGet = false; cloud.fromCache = true; const C = makeDevice(html, cloud, UID); C.add('notes', note(10)); await C.login(); await C.flush();
    assert.strictEqual(cloud.writes, 0); sameSet(cloudIds(cloud, 'notes'), [1]);
  });

  await t('9. Cambios hechos sin internet sobreviven a cerrar y reabrir la app, y se suben fusionados', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID); let B = makeDevice(html, cloud, UID);
    await A.login(); A.add('notes', note(1)); await A.flush(); await B.login();
    B.setOnline(false); B.add('notes', note(3));
    A.add('notes', note(2)); await A.flush();
    B = B.restart(); B.setOnline(false); await B.login(); sameSet(B.ids('notes'), [1, 3]);   // reabre aún sin internet
    B.setOnline(true); await B.login(); await B.flush();                                       // reabre con internet
    sameSet(cloudIds(cloud, 'notes'), [1, 2, 3]); sameSet(B.ids('notes'), [1, 2, 3]);
  });

  await t('10. Más de 1 MB: no se intenta subir, la nube queda intacta y los datos locales también', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID); await A.login(); A.add('notes', note(1)); await A.flush();
    A.add('notes', note(2, { content: 'x'.repeat(1100 * 1024) })); await A.flush();
    sameSet(cloudIds(cloud, 'notes'), [1]); sameSet(A.ids('notes'), [1, 2]);
    assert.ok(A.toasts.some(m => /1 MB/.test(m)));
  });

  await t('11. Reordenar en un dispositivo no provoca un rebote infinito de subidas', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); [1, 2, 3].forEach(i => A.add('notes', note(i))); await A.flush(); await B.login();
    A.run('state.notes.reverse(); save();'); await A.flush();
    sameSet(B.ids('notes'), [1, 2, 3]);
    const before = cloud.writes; for (let i = 0; i < 3; i++) { await A.flush(); await B.flush(); }
    assert.strictEqual(cloud.writes, before);
    assert.strictEqual(JSON.stringify(B.run('state.notes.map(n=>n.id)')), JSON.stringify(A.run('state.notes.map(n=>n.id)')));
  });

  await t('12. Almacenamiento local lleno: el resto se guarda y SIEMPRE se sube a la nube', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID); await A.login();
    A.quotaFail = k => k === 'nn_notes'; A.add('notes', note(1)); await A.flush();
    sameSet(cloudIds(cloud, 'notes'), [1]); assert.ok(A.toasts.some(m => /lleno/.test(m)));
  });

  await t('13. Datos de ejemplo nunca se mezclan con tus datos reales de la nube', async () => {
    const cloud = new Cloud(); cloud.docs['users/' + UID] = { notes: [note(500)], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    const B = makeDevice(html, cloud, UID, { nn_notes: JSON.stringify([{ id: 1, title: 'Bienvenido a NOVA HUB ejemplo', content: '' }]) });
    await B.login(); await B.flush(); sameSet(B.ids('notes'), [500]); sameSet(cloudIds(cloud, 'notes'), [500]);
  });

  await t('14. Proyectos y hábitos tampoco se pierden entre dispositivos', async () => {
    const cloud = new Cloud(), A = makeDevice(html, cloud, UID), B = makeDevice(html, cloud, UID);
    await A.login(); await B.login();
    A.add('habits', { id: 20, name: 'Leer', logs: [] }); await A.flush();
    B.setOnline(false); B.add('projects', { id: 30, name: 'P', tasks: [{ title: 't', done: false }] }); B.add('diary', { id: 40, content: 'hola' });
    A.add('habits', { id: 21, name: 'Correr', logs: [] }); await A.flush();
    B.setOnline(true); await B.flush();
    ['habits', 'projects', 'diary'].forEach(k => sameSet(A.ids(k), B.ids(k)));
    sameSet(cloudIds(cloud, 'habits'), [20, 21]); sameSet(cloudIds(cloud, 'projects'), [30]); sameSet(cloudIds(cloud, 'diary'), [40]);
  });

  await t('14b. Datos creados en el dispositivo SIN sesión se unen con los de la nube al iniciar sesión (no se reemplazan)', async () => {
    const cloud = new Cloud(); cloud.docs['users/' + UID] = { notes: [note(500)], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    const B = makeDevice(html, cloud, UID, { nn_notes: JSON.stringify([note(900)]) });
    await B.login(); await B.flush(); await B.flush();
    sameSet(B.ids('notes'), [500, 900]); sameSet(cloudIds(cloud, 'notes'), [500, 900]);
  });

  await t('14c. Cerrar la app ANTES de terminar la primera descarga no pierde lo escrito (marca de pendiente persistente)', async () => {
    const cloud = new Cloud(); cloud.docs['users/' + UID] = { notes: [note(500)], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    let B = makeDevice(html, cloud, UID); cloud.failGet = true; await B.login();      // la primera descarga falla
    B.add('notes', note(901));                                                        // el usuario escribe igual
    assert.ok(B.run('hasUnsynced()'));
    cloud.failGet = false; B = B.restart(); await B.login(); await B.flush();           // cierra y reabre
    sameSet(B.ids('notes'), [500, 901]); sameSet(cloudIds(cloud, 'notes'), [500, 901]);
  });

  await t('14d. Datos de OTRA cuenta de Google en el dispositivo no se mezclan con la cuenta nueva', async () => {
    const cloud = new Cloud(); const A = makeDevice(html, cloud, 'user1'); await A.login(); A.add('notes', note(1)); await A.flush();
    cloud.docs['users/user2'] = { notes: [note(700)], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: {} };
    const B = makeDevice(html, cloud, 'user2', { ...A.ls }); await B.login(); await B.flush();
    sameSet(B.ids('notes'), [700]); sameSet(cloud.docs['users/user2'].notes.map(n => n.id), [700]);
    sameSet(cloud.docs['users/user1'].notes.map(n => n.id), [1]);                         // la cuenta anterior sigue intacta
    assert.ok(JSON.parse(B.ls['nn_safety_copy'] || 'null'));                              // y sus datos quedaron en la copia local
  });

  // ── Prueba aleatoria (fuzz): 3 dispositivos, desconexiones, ediciones y borrados al azar ──
  await t('15. 300 secuencias aleatorias: nada creado y no borrado a propósito se pierde; todos convergen', async () => {
    let seed = Number(process.env.FUZZ_SEED || 12345); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let run = 0; run < Number(process.env.FUZZ_RUNS || 300); run++) {
      const cloud = new Cloud(); const devs = [0, 1, 2].map(() => makeDevice(html, cloud, UID));
      for (const d of devs) await d.login();
      const alive = new Set(), deleted = new Set(); let nextId = 1000 + run * 1000; let clock = 1;
      const steps = 8 + Math.floor(rnd() * 20);
      for (let s = 0; s < steps; s++) {
        const d = devs[Math.floor(rnd() * 3)], r = rnd();
        if (r < 0.30) { const id = nextId++; d.add('notes', note(id, { updatedAt: clock++ })); alive.add(id); }
        else if (r < 0.45) { const mine = d.ids('notes'); if (mine.length) { const id = mine[Math.floor(rnd() * mine.length)]; d.edit('notes', id, { content: 'e' + clock, updatedAt: clock++ }); } }
        else if (r < 0.58) { const mine = d.ids('notes'); if (mine.length) { const id = mine[Math.floor(rnd() * mine.length)]; d.del('notes', id); alive.delete(id); deleted.add(id); } }
        else if (r < 0.66) { d.setOnline(false); }
        else if (r < 0.76) { d.setOnline(true, rnd() < 0.5); }   // a veces sube antes de recibir lo nuevo
        else if (r < 0.80) { d.emptyTrash(); }
        else { await d.flush(); }
      }
      for (const d of devs) d.setOnline(true);
      for (let pass = 0; pass < 3; pass++) for (const d of devs) await d.flush();
      const finalCloud = cloudIds(cloud, 'notes');
      alive.forEach(id => assert.ok(finalCloud.includes(id), `run ${run}: se perdió la nota ${id} (cloud=${finalCloud})`));
      deleted.forEach(id => assert.ok(!finalCloud.includes(id) || devs.some(d => d.ids('notes').includes(id)), `run ${run}: inconsistencia con ${id}`));
      for (const d of devs) sameSet(d.ids('notes'), finalCloud);
    }
  });

  await t('16. 200 secuencias aleatorias más duras: reinicios de la app, fallos de red al subir y varias colecciones', async () => {
    let seed = Number(process.env.FUZZ_SEED2 || 987654); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const KINDS = ['notes', 'projects', 'habits', 'reminders', 'diary'];
    for (let run = 0; run < Number(process.env.FUZZ_RUNS2 || 200); run++) {
      const cloud = new Cloud(); const devs = [0, 1, 2].map(() => makeDevice(html, cloud, UID));
      for (const d of devs) await d.login();
      const alive = {}; KINDS.forEach(k => alive[k] = new Set()); let nextId = 1000 + run * 1000, clock = 1;
      const steps = 10 + Math.floor(rnd() * 25); const log = [];
      for (let s = 0; s < steps; s++) {
        const i = Math.floor(rnd() * 3), d = devs[i], r = rnd(), k = KINDS[Math.floor(rnd() * KINDS.length)];
        log.push('paso ' + s + ': dev' + i + ' r=' + r.toFixed(2) + ' ' + k);
        if (r < 0.28) { const id = nextId++; d.add(k, { id, title: 't' + id, name: 'n' + id, content: 'c', updatedAt: clock++ }); alive[k].add(id); }
        else if (r < 0.40) { const mine = d.ids(k); if (mine.length) d.edit(k, mine[Math.floor(rnd() * mine.length)], { content: 'e' + clock, updatedAt: clock++ }); }
        else if (r < 0.50) { const mine = d.ids(k); if (mine.length) { const id = mine[Math.floor(rnd() * mine.length)]; d.del(k, id); alive[k].delete(id); } }
        else if (r < 0.57) d.setOnline(false);
        else if (r < 0.66) d.setOnline(true, rnd() < 0.5);
        else if (r < 0.72) { cloud.failTx = 'unavailable'; await d.flush(); cloud.failTx = null; }        // la subida falla a mitad
        else if (r < 0.78) { const was = d.online; devs[i] = d.restart(); devs[i].online = was; await devs[i].login(); }   // cierra y reabre la app
        else await d.flush();
      }
      for (const d of devs) d.setOnline(true);
      for (let pass = 0; pass < 4; pass++) for (const d of devs) await d.flush();
      try {
        KINDS.forEach(k => {
          const finalIds = cloudIds(cloud, k);
          alive[k].forEach(id => assert.ok(finalIds.includes(id), `run ${run}: se perdió ${k}/${id}`));
          for (const d of devs) sameSet(d.ids(k), finalIds);
        });
      } catch (e) {
        if (process.env.TRACE) { console.log('\n--- BITÁCORA ---'); console.log('ids: ' + devs.map((d, i) => 'dev' + i + '=' + d.run('DEVICE_ID')).join(' ')); (cloud.history || []).forEach(l => console.log('NUBE ' + l)); log.forEach(l => console.log(l)); devs.forEach((d, i) => { console.log('dev' + i + ':'); d.trace.forEach(l => console.log('   ' + l)); }); }
        throw e;
      }
    }
  });

  const ok = results.filter(r => r[0]).length;
  results.forEach(r => console.log((r[0] ? '✅ ' : '❌ ') + r[1] + (r[0] ? '' : '\n     → ' + r[2])));
  console.log(`\n${ok}/${results.length} pruebas pasaron (${path.relative(process.cwd(), file)})`);
  process.exit(ok === results.length ? 0 : 1);
})();
