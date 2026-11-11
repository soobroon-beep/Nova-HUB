// NOVA HUB · Briefing diario personal (sin cripto) con IA gratuita de modelos abiertos (worker/ai.mjs).
// Las noticias son REALES: titulares de Google Noticias (México, IA, tecnología y Orizaba) que la IA solo resume.
// Un solo archivo que usan DOS lados:
//   · worker/reminders.mjs (Cloudflare, con la app cerrada): lo genera solo a las 8:30 y te manda el aviso.
//   · index.html (botón «Generar ahora»): lo carga como módulo y usa el mismo prompt y el mismo formato.
// Secciones: saludo, clima de Orizaba, eventos próximos en Orizaba, noticias globales clave,
// IA (resumen + lo nuevo), tecnología, idea de tatuaje, reflexión y un dato curioso.

export const BRIEFING_VERSION = 2;
export const BRIEFING_TIME = '08:30';          // hora local del usuario
export const BRIEFING_WINDOW_MIN = 120;        // si a las 8:30 falló, reintenta hasta las 10:30
export const BRIEFING_KEEP = 7;                // cuántos briefings se guardan en la nube
import * as AI from './ai.mjs';
export const DEFAULT_PLACE = {name: 'Orizaba', region: 'Orizaba, Veracruz', lat: 18.8508, lon: -97.1036, tz: 'America/Mexico_City'};

/* ───────── Clima (Open-Meteo, gratis y sin clave) ───────── */
const WMO = [
  [[0], '☀️', 'Despejado'], [[1], '🌤️', 'Casi despejado'], [[2], '⛅', 'Parcialmente nublado'], [[3], '☁️', 'Nublado'],
  [[45, 48], '🌫️', 'Neblina'], [[51, 53, 55, 56, 57], '🌦️', 'Llovizna'], [[61, 63, 66], '🌧️', 'Lluvia'], [[65, 67], '🌧️', 'Lluvia fuerte'],
  [[71, 73, 75, 77], '❄️', 'Nieve'], [[80, 81], '🌦️', 'Chubascos'], [[82], '⛈️', 'Chubascos fuertes'], [[95, 96, 99], '⛈️', 'Tormenta']
];
export const weatherInfo = code => { const w = WMO.find(([c]) => c.includes(Number(code))); return w ? {icon: w[1], desc: w[2]} : {icon: '🌡️', desc: 'Sin dato'}; };

export async function fetchWeather(fetchFn = fetch, place = DEFAULT_PLACE) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
      `&timezone=${encodeURIComponent(place.tz || 'America/Mexico_City')}&forecast_days=1`;
    const r = await fetchFn(u); if (!r.ok) return {ok: false};
    const d = await r.json(), c = d.current || {}, day = d.daily || {};
    const code = c.weather_code ?? (day.weather_code || [])[0];
    const round = n => (typeof n === 'number' ? Math.round(n) : '?');
    return {ok: true, city: place.name, ...weatherInfo(code), tempC: round(c.temperature_2m), feelsC: round(c.apparent_temperature),
      humidity: round(c.relative_humidity_2m), windKmph: round(c.wind_speed_10m), maxC: round((day.temperature_2m_max || [])[0]),
      minC: round((day.temperature_2m_min || [])[0]), rainPct: round((day.precipitation_probability_max || [])[0])};
  } catch { return {ok: false}; }
}

/* ───────── Titulares reales (Google Noticias RSS) ───────── */
const GN = q => `https://news.google.com/rss${q}${q.includes('?') ? '&' : '?'}hl=es-419&gl=MX&ceid=MX:es-419`;
export const FEEDS = {
  mexico: GN(''),
  ia: GN('/search?q=' + encodeURIComponent('inteligencia artificial when:3d')),
  tech: GN('/headlines/section/topic/TECHNOLOGY'),
  orizaba: GN('/search?q=' + encodeURIComponent('Orizaba when:14d'))
};
const unent = t => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
export function parseRss(xml, n = 10) {
  const out = [], re = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g; let m;
  const src = String(xml || '').slice(0, 120000);
  while ((m = re.exec(src)) && out.length < n) { const t = unent(m[1]); if (t && !out.includes(t)) out.push(t); }
  return out;
}
export async function fetchHeadlines(fetchFn = fetch) {
  const out = {};
  await Promise.all(Object.entries(FEEDS).map(async ([k, url]) => {
    try { const r = await fetchFn(url, {headers: {'user-agent': 'Mozilla/5.0 NovaHub'}}); out[k] = r.ok ? parseRss(await r.text(), k === 'orizaba' ? 12 : 10) : []; } catch { out[k] = []; }
  }));
  return out;
}
const TOPIC = /cripto|bitcoin|ethereum|blockchain|bolsa|acciones|wall street|nasdaq|dow jones|peso.*d[oó]lar|tipo de cambio/i;
const cleanList = l => (Array.isArray(l) ? l : []).filter(t => typeof t === 'string' && !TOPIC.test(t)).slice(0, 12);

/* ───────── Prompt ───────── */
export const SYSTEM = 'Eres el asistente personal de una persona en Orizaba, Veracruz (México). Escribes su briefing de la mañana: ' +
  'cálido, cercano y fácil de leer, como un buen amigo bien informado, en español de México. Para noticias, IA, tecnología y Orizaba ' +
  'usa SOLO los titulares reales que te doy (resúmelos y explica por qué importan; no inventes hechos, fechas ni cifras). Nunca incluyas criptomonedas, trading, bolsa ni mercados financieros. Responde ÚNICAMENTE con un objeto JSON válido: ' +
  'sin texto antes ni después, sin bloques de código, sin URLs y sin markdown.';

export function buildPrompt({name = 'Payi', dateLabel, dateStr, weather, place = DEFAULT_PLACE, headlines = {}} = {}) {
  const w = weather && weather.ok
    ? `${weather.desc}, ${weather.tempC}°C ahora (sensación ${weather.feelsC}°C), máx ${weather.maxC}°C / mín ${weather.minC}°C, probabilidad de lluvia ${weather.rainPct}%, humedad ${weather.humidity}%, viento ${weather.windKmph} km/h`
    : 'no disponible (búscalo tú)';
  const H = (title, l) => { l = cleanList(l); return `${title}:\n${l.length ? l.map(t => '- ' + t).join('\n') : '- (sin titulares disponibles)'}`; };
  return [
    `Hoy es ${dateLabel} (${dateStr}). La persona se llama ${name}: es tatuador profesional (estilo neo-japonés / new school, paleta carmesí, dorado, jade y negro con contraste de línea muy marcado) y le apasionan la IA y la tecnología.`,
    `Clima en ${place.region}: ${w}.`,
    '',
    'TITULARES REALES DE HOY (fuente: Google Noticias):',
    H('México y el mundo', headlines.mexico), H('Inteligencia artificial', headlines.ia), H('Tecnología', headlines.tech), H('Orizaba y la región', headlines.orizaba),
    '',
    'Qué va en cada parte:',
    `- saludo: 1-2 frases cálidas de buenos días para ${name}, con buena energía, mencionando el día y el clima.`,
    '- climaTip: 1 frase práctica según el clima de hoy (qué ponerse, si llevar paraguas, mejor hora para salir).',
    '- orizaba: 2-4 eventos o avisos PRÓXIMOS en Orizaba o muy cerca (festivales, ferias, conciertos, cultura, avisos de la ciudad) sacados de los titulares de Orizaba. Si ninguno es un evento próximo, deja la lista vacía.',
    '- noticias: las 3-4 noticias más importantes de los titulares de México y el mundo, cada una en 2 frases (qué pasó y por qué importa). Nada de finanzas ni cripto.',
    '- ia.resumen: 2-3 frases con el panorama de la IA de esta semana, en tono de resumen, no de nota periodística.',
    '- ia.puntos: 3-4 cosas nuevas o eventos importantes de IA tomados de los titulares de IA, cada una en 1-2 frases: qué es y para qué sirve.',
    '- tech: 2-3 novedades de tecnología de los titulares de Tecnología que no sean IA ni cripto.',
    '- tatuaje: una idea ORIGINAL de tatuaje en su estilo; puede inspirarse en la temporada o en algo de hoy.',
    '- reflexion: 2-3 frases originales para arrancar el día con calma y enfoque (no cites a nadie).',
    '- dato: 1 dato curioso breve y verdadero.',
    '',
    'Devuelve EXACTAMENTE este JSON con estas claves (textos cortos y claros, sin URLs):',
    '{"saludo":"","climaTip":"","orizaba":[{"titulo":"","cuando":"Sáb 15 nov","detalle":""}],"noticias":[{"titulo":"","resumen":""}],' +
    '"ia":{"resumen":"","puntos":[{"titulo":"","resumen":""}]},"tech":[{"titulo":"","resumen":""}],' +
    '"tatuaje":{"titulo":"","idea":"","elementos":"","paleta":"","zona":""},"reflexion":"","dato":""}'
  ].join('\n');
}

/* ───────── Parseo tolerante ───────── */
const str = v => (typeof v === 'string' ? v.replace(/<\/?cite[^>]*>/g, '').replace(/\*\*/g, '').trim() : '');
const items = (v, n, keys) => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object')
  .map(x => Object.fromEntries(keys.map(k => [k, str(x[k])]))).filter(x => x[keys[0]]).slice(0, n);
export function parseBriefing(raw) {
  const txt = String(raw || '');
  let o = null;
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b > a) { try { o = JSON.parse(txt.slice(a, b + 1)); } catch { o = null; } }
  if (!o || typeof o !== 'object') return null;
  const ia = o.ia && typeof o.ia === 'object' ? o.ia : {};
  const t = o.tatuaje && typeof o.tatuaje === 'object' ? o.tatuaje : {};
  const s = {
    saludo: str(o.saludo), climaTip: str(o.climaTip),
    orizaba: items(o.orizaba, 4, ['titulo', 'cuando', 'detalle']),
    noticias: items(o.noticias, 4, ['titulo', 'resumen']),
    ia: {resumen: str(ia.resumen), puntos: items(ia.puntos, 4, ['titulo', 'resumen'])},
    tech: items(o.tech, 3, ['titulo', 'resumen']),
    tatuaje: {titulo: str(t.titulo), idea: str(t.idea), elementos: str(t.elementos), paleta: str(t.paleta), zona: str(t.zona)},
    reflexion: str(o.reflexion), dato: str(o.dato)
  };
  return s.saludo || s.noticias.length || s.ia.resumen ? s : null;
}

/* ───────── Fecha en la zona del usuario ───────── */
export function localDate(ms, tz = DEFAULT_PLACE.tz) {
  const d = new Date(ms);
  const p = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(d);
  const label = new Intl.DateTimeFormat('es-MX', {timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(d);
  return {dateStr: p, dateLabel: label};
}

/* ───────── Todo junto ───────── */
// headlines: si no se pasan, se descargan (en el servidor). En la app se piden al servidor de avisos (/briefing/feeds).
export async function generateBriefing({name, nowMs = Date.now(), tz, place = DEFAULT_PLACE, fetchFn = fetch, server = false, env, headlines, source = 'auto'} = {}) {
  const zone = tz || place.tz;
  const {dateStr, dateLabel} = localDate(nowMs, zone);
  const [weather, heads] = await Promise.all([fetchWeather(fetchFn, place), headlines ? Promise.resolve(headlines) : fetchHeadlines(fetchFn)]);
  const msgs = [{role: 'system', content: SYSTEM}, {role: 'user', content: buildPrompt({name, dateLabel, dateStr, weather, place, headlines: heads})}];
  let raw = (await AI.chat(msgs, {fetchFn, server, env: env && (env.AI || env.GROQ_KEY) ? env : undefined, task: 'json', maxTokens: 2200, temperature: .6, budget: server ? 240000 : 120000, timeout: 90000})).text;
  if (!parseBriefing(raw)) { // a veces el modelo se sale del formato: un segundo intento pidiendo solo el JSON
    msgs.push({role: 'assistant', content: raw.slice(0, 4000)}, {role: 'user', content: 'Devuélvelo de nuevo SOLO como el objeto JSON pedido, sin nada más.'});
    raw = (await AI.chat(msgs, {fetchFn, server, env: env && (env.AI || env.GROQ_KEY) ? env : undefined, task: 'json', maxTokens: 2200, temperature: .3, budget: server ? 120000 : 60000, timeout: 90000})).text;
  }
  const sections = parseBriefing(raw);
  if (!sections) throw new Error('La IA no devolvió un briefing válido');
  return {v: BRIEFING_VERSION, id: nowMs, date: dateStr, generatedAt: new Date(nowMs).toISOString(), city: place.name, source, weather, sections};
}

// Texto corto para la notificación
export function pushText(entry) {
  const w = entry && entry.weather && entry.weather.ok ? `${entry.weather.icon} ${entry.weather.tempC}°C en ${entry.city}` : '';
  return {title: '☀️ Tu briefing de hoy está listo', body: [w, 'Ábrelo en tu Dashboard'].filter(Boolean).join(' · ')};
}

// Agrega un briefing a la lista (más reciente primero, sin repetir día, máximo BRIEFING_KEEP)
export function addToList(list, entry) {
  const rest = (Array.isArray(list) ? list : []).filter(e => e && e.v === BRIEFING_VERSION && e.date !== entry.date);
  return [entry, ...rest].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id).slice(0, BRIEFING_KEEP);
}
