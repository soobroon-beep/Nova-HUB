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

test('titulares reales: RSS de Google Noticias, sin repetidos y sin cripto en el prompt', async () => {
  const B = await Bm();
  const xml = '<rss><channel><title>x</title><item><title><![CDATA[Gran noticia &amp; más - Medio]]></title></item><item><title>Gran noticia &amp; más - Medio</title></item><item><title>Otra</title></item></channel></rss>';
  assert.deepStrictEqual(B.parseRss(xml), ['Gran noticia & más - Medio', 'Otra']);
  const p = B.buildPrompt({dateLabel: 'hoy', dateStr: '2026-11-10', headlines: {mexico: ['Sube el bitcoin a récord', 'Reforma aprobada'], ia: ['Nuevo modelo abierto'], tech: [], orizaba: ['Festival en Orizaba']}});
  assert.ok(p.includes('Reforma aprobada') && p.includes('Nuevo modelo abierto') && p.includes('Festival en Orizaba'));
  assert.ok(!p.includes('bitcoin'), 'los titulares de cripto se filtran');
  assert.match(p, /sin titulares disponibles/);
});

test('IA en la app: primero tu servidor NOVA HUB, luego VORTEX y salta lo que pide créditos', async () => {
  const AI = await import('../worker/ai.mjs'), tried = [];
  const fake = async (url, init) => { const b = JSON.parse(init.body); const who = url.includes('nova-hub') ? 'nh' : url.includes('vortex') ? 'vx' : url.includes('gen.') ? 'gen' : 'old'; tried.push(b.model + '@' + who);
    if (who === 'nh') return new Response('{"error":"Las IAs del servidor no respondieron"}', {status: 503});
    if (who === 'vx') return new Response(JSON.stringify({choices: [{message: {content: 'You do not have enough credits, top up'}}]}));
    if (who === 'gen') return new Response('{"error":{"message":"Payment required"}}', {status: 402});
    return new Response(JSON.stringify({choices: [{message: {content: '<think>x</think>Hola Payi'}}]})); };
  const r = await AI.chat([{role: 'user', content: 'hola'}], {fetchFn: fake});
  assert.deepStrictEqual(r, {text: 'Hola Payi', model: 'pollinations'});
  assert.deepStrictEqual(tried, ['openai@nh', 'openai@vx', 'deepseek@gen', 'openai@old'], 'sin créditos en Pollinations no insiste con cada modelo');
});

test('IA en la app: si tu servidor contesta, no se prueba nada más', async () => {
  const AI = await import('../worker/ai.mjs'), tried = [];
  const fake = async (url, init) => { tried.push(url); assert.strictEqual(JSON.parse(init.body).task, 'json'); return new Response(JSON.stringify({model: 'llama-3.3 · Cloudflare', choices: [{message: {content: '{"ok":1}'}}]})); };
  const r = await AI.chat([{role: 'system', content: 'Devuelve solo JSON'}, {role: 'user', content: 'x'}], {fetchFn: fake});
  assert.strictEqual(r.text, '{"ok":1}'); assert.deepStrictEqual(tried, [AI.NH_URL]);
});

test('IA en el servidor: Groq primero, luego Cloudflare Workers AI, sin salir a internet', async () => {
  const AI = await import('../worker/ai.mjs'), runs = [];
  const env = {GROQ_KEY: 'gsk_x', AI: {run: async (m, inp) => { runs.push(m); if (m.includes('gpt-oss')) throw new Error('cupo'); return {response: 'Buenos días'}; }}};
  const fake = async () => new Response('{"error":"rate"}', {status: 429});
  const r = await AI.chat([{role: 'user', content: 'hola'}], {fetchFn: fake, env, server: true});
  assert.strictEqual(r.text, 'Buenos días'); assert.match(r.model, /Cloudflare/);
  assert.deepStrictEqual(runs, ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
});

test('ruta /ai del servidor: contesta como OpenAI, bloquea orígenes ajenos y quita imágenes', async () => {
  const AI = await import('../worker/ai.mjs'); let got;
  const env = {AI: {run: async (m, inp) => { got = inp.messages; return {response: 'listo'}; }}};
  const req = (origin, body) => new Request('https://nova-hub-push.soobroon.workers.dev/ai', {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, origin ? {origin} : {}), body: JSON.stringify(body)});
  const ok = await AI.aiRoute(req('https://soobroon-beep.github.io', {messages: [{role: 'user', content: [{type: 'text', text: 'hola'}, {type: 'image_url', image_url: {url: 'data:x'}}]}]}), env);
  assert.strictEqual(ok.status, 200); assert.strictEqual((await ok.json()).choices[0].message.content, 'listo'); assert.deepStrictEqual(got, [{role: 'user', content: 'hola'}]);
  assert.strictEqual((await AI.aiRoute(req('https://otra.com', {messages: [{role: 'user', content: 'x'}]}), env)).status, 403);
  const st = await AI.aiRoute(new Request('https://x/ai/status', {headers: {origin: 'https://soobroon-beep.github.io'}}), env);
  assert.deepStrictEqual(await st.json(), {ok: true, ready: true, groq: false, cloudflare: true});
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

test('cuándo toca: 8:30 en su zona, una vez al día, con candado', async () => {
  const w = await W();
  const at = (hhmm) => Date.parse(`2026-11-10T${hhmm}:00-06:00`);
  const u = {tz: CDMX, settings: {aiProvider: 'claude', aiApiKey: 'sk-ant-x', username: 'Víctor', pixel: {nombre: 'Payi'}}};
  assert.strictEqual(w.briefingDue(u, at('08:29')), null);
  const due = w.briefingDue(u, at('08:30'));
  assert.deepStrictEqual(due, {zone: CDMX, dateStr: '2026-11-10', name: 'Payi', tries: 1});
  assert.strictEqual(w.briefingDue(u, at('10:30')), null, 'fuera de la ventana');
  assert.strictEqual(w.briefingDue({...u, briefings: [{v: 2, date: '2026-11-10'}]}, at('08:31')), null, 'ya hay de hoy');
  assert.ok(w.briefingDue({...u, briefings: [{v: 2, date: '2026-11-09'}]}, at('08:31')), 'el de ayer no cuenta');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 1}}, at('08:35')), null, 'otro en curso');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 1}}, at('08:46')).tries, 2, 'reintento');
  assert.strictEqual(w.briefingDue({...u, briefingLock: {date: '2026-11-10', at: at('08:30'), tries: 3}}, at('09:30')), null, 'máximo 3 intentos');
  assert.ok(w.briefingDue({tz: CDMX, settings: {}}, at('08:30')), 'ya no necesita API key: usa la IA gratuita');
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
    settings: w.encode({username: 'Payi'}),
    fcmTokens: {arrayValue: {values: [{stringValue: 'tok'}]}},
    briefings: w.encode([{v: 2, id: 1, date: '2026-11-09', sections: {}}])
  };
  const sends = [], patches = []; let commit = null, claudeBody = null;
  const J = (o, s = 200) => new Response(JSON.stringify(o), {status: s});
  const fake = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return J({access_token: 'AT'});
    if (url.startsWith('https://api.open-meteo.com/')) { assert.match(url, /latitude=18\.85/); return J({current: {temperature_2m: 17.4, apparent_temperature: 16, relative_humidity_2m: 80, weather_code: 3, wind_speed_10m: 8}, daily: {temperature_2m_max: [22], temperature_2m_min: [12], precipitation_probability_max: [40]}}); }
    if (url.startsWith('https://news.google.com/')) return new Response('<rss><item><title>Titular real</title></item></rss>');
    if (url.startsWith('https://gen.pollinations.ai/')) { claudeBody = JSON.parse(init.body); return J({choices: [{message: {content: '```json\n' + JSON.stringify(SAMPLE) + '\n```'}}]}); }
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
  assert.strictEqual(claudeBody.model, 'deepseek', 'modelo abierto'); assert.ok(claudeBody.messages[1].content.includes('Titular real'));
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

test('dictado: Whisper de Cloudflare cuando no hay Groq', async () => {
  const AI = await import('../worker/ai.mjs'); const seen = [];
  const env = {AI: {run: async (m, inp) => { seen.push(m); return {text: ' hola Cortex '}; }}};
  const res = await AI.aiRoute(new Request('https://x/ai/transcribe', {method: 'POST', headers: {origin: 'https://soobroon-beep.github.io'}, body: JSON.stringify({audio: btoa('RIFFxxxx')})}), env);
  assert.deepStrictEqual(await res.json(), {text: 'hola Cortex'}); assert.deepStrictEqual(seen, ['@cf/openai/whisper-large-v3-turbo']);
});

test('briefing: repara el JSON cuando la IA cierra llaves de más o deja comas', async () => {
  const B = await import('../worker/briefing.mjs');
  const bad = '{"saludo":"Hola","ia":{"resumen":"x","puntos":[{"titulo":"a","resumen":"b"}]}},"tech":[{"titulo":"Nvidia","resumen":"y"}],"dato":"z",}';
  const p = B.parseBriefing(bad);
  assert.strictEqual(p.saludo, 'Hola'); assert.strictEqual(p.tech[0].titulo, 'Nvidia'); assert.strictEqual(p.dato, 'z');
});

test('eventos: búsquedas aparte en Orizaba y la región, sin nota roja y con fecha de publicación', async () => {
  const B = await Bm(), urls = [];
  const rss = items => '<rss><channel>' + items.map(([t, d]) => `<item><title>${t}</title><pubDate>${d}</pubDate></item>`).join('') + '</channel></rss>';
  const fake = async url => { urls.push(url);
    if (url.includes(encodeURIComponent('festival OR feria'))) return new Response(rss([['Festival Máscaras Danzantes llega a Orizaba del 13 al 15 de noviembre - El Sol de Orizaba', 'Mon, 09 Nov 2026 18:00:00 GMT'], ['Balacera en la feria de Orizaba - Medio', 'Tue, 10 Nov 2026 18:00:00 GMT']]));
    if (url.includes('Orizaba%20Veracruz')) return new Response(rss([['Detienen a sujeto en Orizaba - X', ''], ['Cortes de agua en Orizaba este jueves - Y', '']]));
    return new Response('<rss></rss>'); };
  const h = await B.fetchHeadlines(fake);
  assert.ok(Object.keys(B.FEEDS).every(k => k in h), 'todas las secciones');
  assert.ok(['eventos', 'region', 'veracruz'].every(k => B.FEEDS[k]));
  assert.strictEqual(h.eventos.length, 1, 'sin nota roja en eventos');
  assert.match(h.eventos[0], /Máscaras Danzantes.*\(publicado 9 nov\)$/);
  assert.deepStrictEqual(h.orizaba, ['Cortes de agua en Orizaba este jueves - Y', 'Detienen a sujeto en Orizaba - X'], 'lo útil primero, la nota roja al final');
  const leads = B.eventLeads(h);
  assert.deepStrictEqual(leads[0], {titulo: 'Festival Máscaras Danzantes llega a Orizaba del 13 al 15 de noviembre', cuando: '', donde: 'Orizaba', detalle: 'Anuncio del 9 nov'});
  const p = B.buildPrompt({dateLabel: 'miércoles', dateStr: '2026-11-11', headlines: h, agenda: ['12:00 🖋 Cita de tatuaje: Juan']});
  assert.ok(p.includes('EVENTOS anunciados en Orizaba') && p.includes('Máscaras Danzantes') && p.includes('Cita de tatuaje: Juan') && p.includes('Noticias de Veracruz'));
});

test('si la IA deja vacíos los eventos, se muestran los anuncios encontrados', async () => {
  const B = await Bm();
  const fake = async (url) => {
    url = String(url);
    if (url.startsWith('https://api.open-meteo.com/')) return new Response(JSON.stringify({current: {temperature_2m: 18, weather_code: 61}, daily: {time: ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'], temperature_2m_max: [22, 21, 23, 24], temperature_2m_min: [12, 11, 13, 14], precipitation_probability_max: [70, 20, 10, 5], weather_code: [61, 3, 1, 0], sunrise: ['2026-11-11T06:32'], sunset: ['2026-11-11T17:41'], uv_index_max: [6.2]},
      hourly: {time: Array.from({length: 24}, (_, i) => `2026-11-11T${String(i).padStart(2, '0')}:00`), precipitation_probability: Array.from({length: 24}, (_, i) => i >= 15 && i <= 18 ? 70 : 5)}}));
    return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({...SAMPLE, orizaba: []})}}]}));
  };
  const e = await B.generateBriefing({name: 'Payi', nowMs: Date.parse('2026-11-11T08:30:00-06:00'), fetchFn: fake, headlines: {eventos: ['Bierfest Orizaba en Casavegas - Medio (publicado 8 nov)'], region: []}, agenda: []});
  assert.strictEqual(e.sections.orizaba[0].titulo, 'Bierfest Orizaba en Casavegas'); assert.strictEqual(e.sections.eventosCrudos, true);
  assert.strictEqual(e.weather.rainWindow, '15:00–19:00'); assert.strictEqual(e.weather.sunset, '17:41'); assert.strictEqual(e.weather.uvMax, 6);
  assert.deepStrictEqual(e.weather.days.map(d => d.label), ['Jue', 'Vie', 'Sáb']);
});

test('agenda del día: citas de tatuaje, recordatorios y horario en orden', async () => {
  const B = await Bm();
  const l = B.agendaLines({dateStr: '2026-11-11', dow: 3,
    gcal: [{date: '2026-11-11', start: '12:00', end: '15:00', title: 'Juan brazo', calName: '🔥Tatuajes🔥'}, {date: '2026-11-12', start: '10:00', title: 'mañana'}],
    reminders: [{datetime: '2026-11-11T18:00', title: 'Comprar tintas'}, {datetime: '2026-11-11T09:00', title: 'ya avisado', notified: true}],
    routines: [{title: 'Gym', start: '07:00', repeatDays: [3]}, {title: 'Domingo', start: '08:00', repeatDays: [0]}]});
  assert.deepStrictEqual(l, ['07:00 Bloque: Gym', '12:00 🖋 Cita de tatuaje: Juan brazo (hasta 15:00)', '18:00 ⏰ Comprar tintas']);
});

test('IA: ideas para aplicar los avances a sus apps (Nova Hub, Vortex, Neural Brain…)', async () => {
  const B = await Bm();
  const p = B.buildPrompt({dateLabel: 'hoy', dateStr: '2026-11-11', projects: ['Estudio', 'Web Gaby']});
  for (const k of ['NOVA HUB', 'VORTEX', 'NEURAL BRAIN', 'INKBOT', 'ia.aplicar', 'Estudio, Web Gaby']) assert.ok(p.includes(k), k);
  const s = B.parseBriefing(JSON.stringify({...SAMPLE, ia: {...SAMPLE.ia, aplicar: [{proyecto: 'NEURAL BRAIN', avance: 'Memoria larga', idea: 'Que recuerde tus notas.'}, {proyecto: '', idea: 'x'}]}}));
  assert.deepStrictEqual(s.ia.aplicar, [{proyecto: 'NEURAL BRAIN', idea: 'Que recuerde tus notas.', avance: 'Memoria larga'}]);
});

test('titulares: varias fuentes por sección, sin repetidos y con resumen en IA y mundo', async () => {
  const B = await Bm();
  const now = new Date().toUTCString();
  const fake = async url => {
    if (url.includes('techcrunch')) return new Response(`<rss><channel><item><title><![CDATA[OpenAI launches GPT-6]]></title><description><![CDATA[<p>The new model doubles context and is cheaper.</p>]]></description><pubDate>${now}</pubDate></item></channel></rss>`);
    if (url.includes('theverge')) return new Response(`<feed><entry><title>OpenAI launches GPT-6</title><updated>${new Date().toISOString()}</updated></entry><entry><title>Google Gemini update</title><summary>Faster on phones and free tier.</summary><updated>${new Date().toISOString()}</updated></entry></feed>`);
    if (url.includes('bbci')) return new Response(`<rss><item><title>Cumbre del clima termina con acuerdo</title><description>Casi 200 países firmaron.</description><pubDate>${now}</pubDate></item></rss>`);
    return new Response('<rss></rss>');
  };
  const h = await B.fetchHeadlines(fake);
  assert.deepStrictEqual(h.ia, ['OpenAI launches GPT-6 — The new model doubles context and is cheaper.', 'Google Gemini update — Faster on phones and free tier.']);
  assert.deepStrictEqual(h.mundo, ['Cumbre del clima termina con acuerdo — Casi 200 países firmaron.']);
  assert.strictEqual(B.countHeadlines(h), 3);
  const p = B.buildPrompt({dateLabel: 'hoy', dateStr: '2026-11-11', headlines: h});
  assert.ok(p.includes('El mundo (internacional)') && p.includes('GPT-6') && p.includes('"planes"'));
});
