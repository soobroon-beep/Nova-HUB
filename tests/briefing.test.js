// Pruebas del briefing personal (worker/briefing.mjs) y de su ronda de las 8:30 en worker/reminders.mjs.
const test = require('node:test'), assert = require('node:assert');
const Bm = () => import('../worker/briefing.mjs');
const W = () => import('../worker/reminders.mjs');
const CDMX = 'America/Mexico_City';

const SAMPLE = {
  saludo: '¡Buenos días, Payi! Martes fresco en Orizaba.', climaTip: 'Lleva chamarra ligera.',
  orizaba: [{titulo: 'Festival', cuando: 'Sáb 15 nov', detalle: 'En el Palacio de Hierro.'}],
  noticias: [{titulo: 'Algo global', resumen: 'Pasó algo.'}],
  ia: {resumen: 'Semana movida.', puntos: [{titulo: 'Modelo nuevo', resumen: 'Sirve para X.'}]},
  tech: [{titulo: 'Gadget', resumen: 'Nuevo.'}],
  tatuaje: {titulo: 'Koi dorado', idea: 'Un koi...', elementos: 'koi, olas', paleta: 'carmesí y jade', zona: 'antebrazo'},
  reflexion: 'Respira.', dato: 'Dato.'
};

test('el prompt es personal y no pide nada de cripto', async () => {
  const B = await Bm();
  const p = B.buildPrompt({name: 'Payi', dateLabel: 'martes, 10 de noviembre de 2026', dateStr: '2026-11-10', weather: {ok: true, desc: 'Nublado', tempC: 17, feelsC: 16, maxC: 22, minC: 12, rainPct: 40, humidity: 80, windKmph: 9}});
  for (const k of ['Orizaba', 'tatuaje', 'reflexion', 'noticias', '"ia"', 'tech', '17°C']) assert.ok(p.includes(k), k);
  assert.ok(!/BTC|bitcoin|ethereum|soporte|resistencia|trading/i.test(p));
  assert.match(B.SYSTEM, /Nunca incluyas criptomonedas/);
});

test('parseo tolerante: texto alrededor, citas y campos raros', async () => {
  const B = await Bm();
  const s = B.parseBriefing('Aquí va:\n' + JSON.stringify({...SAMPLE, saludo: 'Hola <cite index="1-2">Payi</cite>', noticias: [...SAMPLE.noticias, null, {titulo: ''}, 'x']}) + '\nfin');
  assert.strictEqual(s.saludo, 'Hola Payi');
  assert.strictEqual(s.noticias.length, 1);
  assert.strictEqual(s.tatuaje.titulo, 'Koi dorado');
  assert.strictEqual(B.parseBriefing('no es json'), null);
  assert.strictEqual(B.parseBriefing('{}'), null);
});

test('con web search se une el texto posterior a la última búsqueda', async () => {
  const B = await Bm();
  const c = [{type: 'text', text: 'Voy a buscar'}, {type: 'server_tool_use'}, {type: 'web_search_tool_result'}, {type: 'text', text: '{"saludo":'}, {type: 'text', text: '"hola"}'}];
  assert.strictEqual(B.finalText(c), '{"saludo":"hola"}');
});

test('la lista guarda 7, la más nueva primero, una por día y sin briefings viejos de cripto', async () => {
  const B = await Bm();
  let list = [{date: '2026-11-01', id: 1, sections: {mercadoCripto: 'x'}}]; // formato viejo: se descarta
  for (let d = 1; d <= 9; d++) list = B.addToList(list, {v: 2, id: d, date: `2026-11-0${d}`});
  list = B.addToList(list, {v: 2, id: 99, date: '2026-11-09'});
  assert.strictEqual(list.length, 7);
  assert.deepStrictEqual(list.map(e => e.date)[0], '2026-11-09'); assert.strictEqual(list[0].id, 99);
  assert.ok(list.every(e => e.v === 2));
});

test('cuándo toca: 8:30 en su zona, con API key de Claude, una vez al día, con candado', async () => {
  const w = await W();
  const at = (hhmm) => Date.parse(`2026-11-10T${hhmm}:00-06:00`);
  const u = {tz: CDMX, settings: {aiProvider: 'claude', aiApiKey: 'sk-ant-x', username: 'Víctor', pixel: {nombre: 'Payi'}}};
  assert.strictEqual(w.briefingDue(u, at('08:29')), null);
  const due = w.briefingDue(u, at('08:30'));
  assert.deepStrictEqual(due, {zone: CDMX, dateStr: '2026-11-10', apiKey: 'sk-ant-x', name: 'Payi', tries: 1});
  assert.strictEqual(w.briefingDue(u, at('10:30')), null, 'fuera de la ventana');
  assert.strictEqual(w.briefingDue({...u, briefings: [{v: 2, date: '2026-11-10'}]}, at('08:31')), null, 'ya hay de hoy');
  assert.ok(w.briefingDue({...u, briefings: [{v: 2, date: '2026-11-09'}]}, at('08:31')), 'el de ayer no cuenta');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 1}}, at('08:35')), null, 'otro en curso');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 1}}, at('08:46')).tries, 2, 'reintento');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 3}}, at('09:30')), null, 'máximo 3 intentos');
  assert.strictEqual(w.briefingDue({...u, settings: {...u.settings, aiProvider: 'openai'}}, at('08:30')), null);
  assert.strictEqual(w.briefingDue({...u, settings: {...u.settings, briefingAuto: false}}, at('08:30')), null);
});

test('ronda de las 8:30: genera, guarda solo el campo briefings y avisa', async () => {
  const w = await W(), {subtle} = globalThis.crypto;
  const kp = await subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const pk = Buffer.from(await subtle.exportKey('pkcs8', kp.privateKey)).toString('base64').match(/.{1,64}/g).join('\n');
  const sa = {project_id: 'nova-hub-2a8a0', client_email: 'svc2@nova.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----\n`};
  const NAME = 'projects/nova-hub-2a8a0/databases/(default)/documents/users/U1';
  const fields = {
    tz: {stringValue: CDMX},
    settings: w.encode({aiProvider: 'claude', aiApiKey: 'sk-ant-test', username: 'Payi'}),
    fcmTokens: {arrayValue: {values: [{stringValue: 'tok'}]}},
    briefings: w.encode([{v: 2, id: 1, date: '2026-11-09', sections: {}}])
  };
  const sends = [], patches = []; let commit = null, claudeBody = null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), {status: s});
  const fake = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return J({access_token: 'AT'});
    if (url.startsWith('https://api.open-meteo.com/')) { assert.match(url, /latitude=18\.85/); return J({current: {temperature_2m: 17.4, apparent_temperature: 16, relative_humidity_2m: 80, weather_code: 3, wind_speed_10m: 8}, daily: {temperature_2m_max: [22], temperature_2m_min: [12], precipitation_probability_max: [40]}}); }
    if (url.startsWith('https://api.anthropic.com/')) { assert.strictEqual(init.headers['x-api-key'], 'sk-ant-test'); claudeBody = JSON.parse(init.body); return J({stop_reason: 'end_turn', content: [{type: 'server_tool_use'}, {type: 'web_search_tool_result'}, {type: 'text', text: JSON.stringify(SAMPLE)}]}); }
    assert.strictEqual(init.headers && init.headers.authorization, 'Bearer AT');
    if (url.includes('/documents/users?')) { assert.match(url, /mask\.fieldPaths=briefings/); return J({documents: [{name: NAME, fields}]}); }
    if (init.method === 'PATCH') { patches.push({url, body: JSON.parse(init.body)}); return J({}); }
    if (url.endsWith(':beginTransaction')) return J({transaction: 'TX'});
    if (url.includes('/users/U1?transaction=TX')) return J({name: NAME, fields: {briefings: fields.briefings}});
    if (url.endsWith(':commit')) { commit = JSON.parse(init.body); return J({}); }
    if (url.includes('fcm.googleapis.com')) { sends.push(JSON.parse(init.body).message); return J({name: 'ok'}); }
    throw new Error('llamada inesperada ' + url);
  };
  const r = await w.tick({FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa)}, Date.parse('2026-11-10T08:30:20-06:00'), fake);
  assert.strictEqual(r.briefings, 1);
  assert.match(patches[0].url, /updateMask\.fieldPaths=briefingLock/); assert.ok(!/fieldPaths=(notes|settings)/.test(patches[0].url));
  assert.ok(claudeBody.tools.some(t => t.type === 'web_search_20250305'));
  const wr = commit.writes[0];
  assert.deepStrictEqual(wr.updateMask.fieldPaths, ['briefings'], 'nunca toca notas, proyectos ni ajustes');
  const saved = w.decode(wr.update.fields.briefings);
  assert.deepStrictEqual(saved.map(e => e.date), ['2026-11-10', '2026-11-09']);
  assert.strictEqual(saved[0].sections.tatuaje.titulo, 'Koi dorado');
  assert.strictEqual(saved[0].weather.tempC, 17); assert.strictEqual(saved[0].city, 'Orizaba');
  assert.strictEqual(sends.length, 1);
  assert.strictEqual(sends[0].data.title, '☀️ Tu briefing de hoy está listo');
  assert.match(sends[0].data.body, /17°C en Orizaba/);
  assert.match(sends[0].data.url, /\?view=dashboard$/);
  // a las 8:20 no hace nada
  sends.length = 0; commit = null;
  const r2 = await w.tick({FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa)}, Date.parse('2026-11-10T08:20:00-06:00'), fake);
  assert.ok(!r2.briefings); assert.strictEqual(commit, null); assert.strictEqual(sends.length, 0);
});
