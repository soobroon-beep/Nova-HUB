// NOVA HUB · Briefing diario personal (sin cripto) con IA gratuita de modelos abiertos (worker/ai.mjs).
// Las noticias son REALES: titulares de Google Noticias (México, IA, tecnología, Orizaba, Veracruz y EVENTOS de la región)
// que la IA solo resume. Los eventos se buscan aparte (festivales, ferias, conciertos, teatro…) en Orizaba y alrededores,
// sin nota roja; si la IA no arma la lista, se muestran tal cual los anuncios encontrados (nunca queda vacío si hay algo).
// Un solo archivo que usan DOS lados:
//   · worker/reminders.mjs (Cloudflare, con la app cerrada): lo genera solo a las 8:30 y te manda el aviso.
//   · index.html (botón «Generar ahora»): lo carga como módulo y usa el mismo prompt y el mismo formato.
// Secciones: saludo, clima (hoy + próximos días, horas de lluvia, sol), tu día (agenda y citas), eventos en Orizaba y
// alrededores, noticias de Orizaba/Veracruz, plan sugerido, noticias clave, IA, tecnología, tatuaje, reflexión y dato.

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

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export async function fetchWeather(fetchFn = fetch, place = DEFAULT_PLACE) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,uv_index_max' +
      '&hourly=precipitation_probability' +
      `&timezone=${encodeURIComponent(place.tz || 'America/Mexico_City')}&forecast_days=4`;
    const r = await fetchFn(u); if (!r.ok) return {ok: false};
    const d = await r.json(), c = d.current || {}, day = d.daily || {};
    const code = c.weather_code ?? (day.weather_code || [])[0];
    const round = n => (typeof n === 'number' ? Math.round(n) : '?');
    const hm = t => (typeof t === 'string' && t.includes('T') ? t.slice(11, 16) : '');
    // Próximos días (mañana y los 2 siguientes)
    const days = (day.time || []).slice(1, 4).map((t, i) => ({date: t, label: DOW[new Date(t + 'T12:00:00Z').getUTCDay()], ...weatherInfo((day.weather_code || [])[i + 1]),
      maxC: round((day.temperature_2m_max || [])[i + 1]), minC: round((day.temperature_2m_min || [])[i + 1]), rainPct: round((day.precipitation_probability_max || [])[i + 1])}));
    // Horas de hoy con más probabilidad de lluvia (≥ 40 %), de 7:00 a 23:00
    const today = (day.time || [])[0], h = d.hourly || {}, wet = [];
    (h.time || []).forEach((t, i) => { const hr = Number(String(t).slice(11, 13)); if (String(t).startsWith(today) && hr >= 7 && (h.precipitation_probability || [])[i] >= 40) wet.push(hr); });
    const rainWindow = wet.length ? `${String(wet[0]).padStart(2, '0')}:00–${String(wet[wet.length - 1] + 1).padStart(2, '0')}:00` : '';
    return {ok: true, city: place.name, ...weatherInfo(code), tempC: round(c.temperature_2m), feelsC: round(c.apparent_temperature),
      humidity: round(c.relative_humidity_2m), windKmph: round(c.wind_speed_10m), maxC: round((day.temperature_2m_max || [])[0]),
      minC: round((day.temperature_2m_min || [])[0]), rainPct: round((day.precipitation_probability_max || [])[0]),
      sunrise: hm((day.sunrise || [])[0]), sunset: hm((day.sunset || [])[0]), uvMax: round((day.uv_index_max || [])[0]), rainWindow, days};
  } catch { return {ok: false}; }
}

/* ───────── Titulares reales (Google Noticias RSS) ───────── */
const GN = q => `https://news.google.com/rss${q}${q.includes('?') ? '&' : '?'}hl=es-419&gl=MX&ceid=MX:es-419`;
const Q = q => GN('/search?q=' + encodeURIComponent(q));
const EV_WORDS = '(festival OR feria OR concierto OR expo OR exposición OR teatro OR evento OR "fin de semana" OR carrera OR muestra OR cartelera OR presentación OR tianguis OR desfile OR fiesta)';
export const FEEDS = {
  mexico: GN(''),
  ia: Q('inteligencia artificial when:3d'),
  tech: GN('/headlines/section/topic/TECHNOLOGY'),
  orizaba: Q('Orizaba Veracruz when:4d'),                                                    // noticias locales
  veracruz: Q('Veracruz estado when:2d'),                                                   // noticias del estado
  eventos: Q(`Orizaba ${EV_WORDS} when:21d`),                                               // eventos en Orizaba
  region: Q(`(Córdoba OR Fortín OR "Río Blanco" OR Ixtaczoquitlán OR "Ciudad Mendoza" OR Nogales OR "Altas Montañas") Veracruz ${EV_WORDS} when:21d`)
};
export const EVENT_FEEDS = ['eventos', 'region'];
const unent = t => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
export function parseRssItems(xml, n = 10) {
  const out = [], seen = new Set(), re = /<item>([\s\S]*?)<\/item>/g; let m;
  const src = String(xml || '').slice(0, 160000);
  while ((m = re.exec(src)) && out.length < n) {
    const tt = /<title>([\s\S]*?)<\/title>/.exec(m[1]); if (!tt) continue;
    const t = unent(tt[1]); if (!t || seen.has(t)) continue; seen.add(t);
    const pd = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(m[1]), ms = pd ? Date.parse(unent(pd[1])) : NaN;
    out.push({t, ms: Number.isFinite(ms) ? ms : 0});
  }
  return out;
}
export const parseRss = (xml, n = 10) => parseRssItems(xml, n).map(x => x.t);
// Nota roja: fuera de los eventos (y al final de las noticias locales)
export const CRIME = /asesin|balace|baleado|ejecutad|homicid|feminicid|cad[aá]ver|sin vida|muere|muri[oó]|muerto|fallec|detenid|detien|arrest|captura|robo|asalt|secuestr|desaparec|levant|violencia|ataque armado|disparo|choque|volcadura|vuelca|atropell|accidente|incendio|riña|fiscal[ií]a|polic[ií]a|delincuen/i;
const shortDate = ms => ms ? new Intl.DateTimeFormat('es-MX', {timeZone: DEFAULT_PLACE.tz, day: 'numeric', month: 'short'}).format(new Date(ms)).replace('.', '') : '';
export async function fetchHeadlines(fetchFn = fetch) {
  const out = {};
  await Promise.all(Object.entries(FEEDS).map(async ([k, url]) => {
    try {
      const r = await fetchFn(url, {headers: {'user-agent': 'Mozilla/5.0 NovaHub'}});
      let items = r.ok ? parseRssItems(await r.text(), 30) : [];
      if (EVENT_FEEDS.includes(k)) items = items.filter(x => !CRIME.test(x.t));
      if (k === 'orizaba' || k === 'veracruz') items = [...items.filter(x => !CRIME.test(x.t)), ...items.filter(x => CRIME.test(x.t)).slice(0, 2)];
      items.sort((a, b) => EVENT_FEEDS.includes(k) ? b.ms - a.ms : 0);
      // los eventos llevan la fecha de publicación para que la IA sepa qué tan reciente es el anuncio
      out[k] = items.slice(0, EVENT_FEEDS.includes(k) ? 12 : 10).map(x => EVENT_FEEDS.includes(k) && x.ms ? `${x.t} (publicado ${shortDate(x.ms)})` : x.t);
    } catch { out[k] = []; }
  }));
  return out;
}
const TOPIC = /cripto|bitcoin|ethereum|blockchain|bolsa|acciones|wall street|nasdaq|dow jones|peso.*d[oó]lar|tipo de cambio/i;
const cleanList = l => (Array.isArray(l) ? l : []).filter(t => typeof t === 'string' && !TOPIC.test(t)).slice(0, 12);
const dropSource = t => String(t).replace(/\s*\(publicado [^)]*\)\s*$/, '').replace(/\s+-\s+[^-]{2,60}$/, '').trim();
// Anuncios de eventos encontrados (para mostrarlos aunque la IA no arme la lista)
export function eventLeads(headlines = {}) {
  const out = [], seen = new Set();
  for (const k of EVENT_FEEDS) for (const raw of cleanList(headlines[k])) {
    if (CRIME.test(raw)) continue;
    const pub = (/\(publicado ([^)]*)\)\s*$/.exec(raw) || [])[1] || '', titulo = dropSource(raw), key = titulo.toLowerCase().slice(0, 50);
    if (!titulo || seen.has(key)) continue; seen.add(key);
    out.push({titulo, cuando: '', donde: k === 'eventos' ? 'Orizaba' : 'Región', detalle: pub ? 'Anuncio del ' + pub : ''});
  }
  return out.slice(0, 6);
}

/* ───────── Agenda del día (citas de tatuaje, eventos, recordatorios y horario) ───────── */
// Junta lo de hoy en líneas cortas «HH:MM Título». Lo usan el servidor (desde tu documento) y la app (con Google Calendar).
export function agendaLines({dateStr, dow, reminders = [], routines = [], events = [], gcal = []} = {}) {
  const L = [], add = (t, s, extra) => { t = String(t || '').trim(); if (t) L.push({t: s || '', s: `${s || 'Todo el día'} ${t}${extra ? ' ' + extra : ''}`}); };
  const isTat = e => /tatu/i.test((e && (e.calName || '')) + ' ' + (e && e.title || ''));
  for (const e of [...(Array.isArray(events) ? events : []), ...(Array.isArray(gcal) ? gcal : [])]) if (e && e.date === dateStr) add((isTat(e) ? '🖋 Cita de tatuaje: ' : '') + e.title, e.start, e.end ? `(hasta ${e.end})` : '');
  for (const r of Array.isArray(reminders) ? reminders : []) if (r && !r.notified && typeof r.datetime === 'string' && r.datetime.startsWith(dateStr)) add('⏰ ' + r.title, r.datetime.slice(11, 16));
  for (const b of Array.isArray(routines) ? routines : []) { if (!b || !b.title) continue; const rd = Array.isArray(b.repeatDays) ? b.repeatDays : [0, 1, 2, 3, 4, 5, 6]; if (rd.length && !rd.includes(dow)) continue; add('Bloque: ' + b.title, b.start, b.end ? `(hasta ${b.end})` : ''); }
  const seen = new Set();
  return L.sort((a, b) => (a.t || '99').localeCompare(b.t || '99')).map(x => x.s).filter(s => !seen.has(s) && seen.add(s)).slice(0, 14);
}

/* ───────── Prompt ───────── */
export const SYSTEM = 'Eres el asistente personal de una persona en Orizaba, Veracruz (México). Escribes su briefing de la mañana: ' +
  'cálido, cercano y fácil de leer, como un buen amigo bien informado de la región, en español de México. Para noticias, eventos, IA, tecnología, Orizaba y Veracruz ' +
  'usa SOLO los titulares reales que te doy (resúmelos y explica por qué importan; no inventes hechos, fechas, lugares ni cifras). Nunca incluyas criptomonedas, trading, bolsa ni mercados financieros en las noticias (de su app VORTEX solo hablas de mejoras técnicas, nunca de mercados). Responde ÚNICAMENTE con un objeto JSON válido: ' +
  'sin texto antes ni después, sin bloques de código, sin URLs y sin markdown.';

// Lugares reales para sugerir planes (la IA no inventa sitios)
export const PLACES = ['Cerro del Borrego y su teleférico', 'Paseo del Río Orizaba (reserva animal)', 'Palacio de Hierro (museos)', 'Museo de Arte del Estado (MAEV)', 'Parque Alameda', 'Poliforum Mier y Pesado', 'Centro histórico y Parque Castillo', 'Catedral de San Miguel Arcángel', 'Teatro Ignacio de la Llave', 'Cascada de Rincón Grande', 'Ojo de Agua', 'Mercado Cerritos', 'mirador del Pico de Orizaba', 'cafés del centro'];

// Sus apps y proyectos (para aterrizar los avances de IA a lo que él construye)
export const MY_APPS = [
  'NOVA HUB: su PWA de productividad (notas, proyectos, recordatorios, calendario con citas de tatuaje, hábitos, diario, briefing) con Firebase y su asistente de IA Cortex',
  'VORTEX: su terminal de gráficas con bots, screener, avisos y asistentes de IA (Nexus Pixel, Nova Bot Lab)',
  'NEURAL BRAIN: su PWA de «segundo cerebro» que quiere que aprenda de todo lo que hace en Nova Hub y Vortex',
  'INKBOT PRO: su herramienta para crear contenido de tatuajes para Instagram (historias, captions, calendario)',
  'su estudio de tatuaje (diseños, citas, redes sociales)'
];

export function buildPrompt({name = 'Payi', dateLabel, dateStr, weather, place = DEFAULT_PLACE, headlines = {}, agenda = [], projects = []} = {}) {
  const w = weather && weather.ok
    ? `${weather.desc}, ${weather.tempC}°C ahora (sensación ${weather.feelsC}°C), máx ${weather.maxC}°C / mín ${weather.minC}°C, probabilidad de lluvia ${weather.rainPct}%` +
      `${weather.rainWindow ? ' (más probable entre ' + weather.rainWindow + ')' : ''}, humedad ${weather.humidity}%, viento ${weather.windKmph} km/h` +
      `${weather.uvMax !== undefined && weather.uvMax !== '?' ? ', UV máx ' + weather.uvMax : ''}${weather.sunset ? ', amanece ' + weather.sunrise + ' y se mete el sol ' + weather.sunset : ''}` +
      `${Array.isArray(weather.days) && weather.days.length ? '. Próximos días: ' + weather.days.map(d => `${d.label} ${d.desc} ${d.minC}–${d.maxC}°C lluvia ${d.rainPct}%`).join('; ') : ''}`
    : 'no disponible';
  const H = (title, l) => { l = cleanList(l); return `${title}:\n${l.length ? l.map(t => '- ' + t).join('\n') : '- (sin titulares disponibles)'}`; };
  const ag = (Array.isArray(agenda) ? agenda : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 14);
  return [
    `Hoy es ${dateLabel} (${dateStr}). La persona se llama ${name}: es tatuador profesional en Orizaba (estilo neo-japonés / new school, paleta carmesí, dorado, jade y negro con contraste de línea muy marcado) y le apasionan la IA y la tecnología.`,
    `Clima en ${place.region}: ${w}.`,
    `SUS APPS Y PROYECTOS:\n${MY_APPS.map(t => '- ' + t).join('\n')}${(Array.isArray(projects) ? projects : []).filter(x => typeof x === 'string' && x.trim()).length ? '\n- Proyectos activos en Nova Hub: ' + projects.filter(x => typeof x === 'string' && x.trim()).slice(0, 12).join(', ') : ''}`,
    '',
    `SU AGENDA DE HOY:\n${ag.length ? ag.map(t => '- ' + t).join('\n') : '- (nada agendado)'}`,
    '',
    'TITULARES REALES (fuente: Google Noticias):',
    H('EVENTOS anunciados en Orizaba', headlines.eventos), H('EVENTOS anunciados en la región (Córdoba, Fortín, Río Blanco, Ixtaczoquitlán, Cd. Mendoza, Nogales)', headlines.region),
    H('Noticias de Orizaba', headlines.orizaba), H('Noticias de Veracruz', headlines.veracruz),
    H('México y el mundo', headlines.mexico), H('Inteligencia artificial', headlines.ia), H('Tecnología', headlines.tech),
    '',
    'Qué va en cada parte:',
    `- saludo: 1-2 frases cálidas de buenos días para ${name}, con buena energía, mencionando el día y el clima.`,
    '- climaTip: 1-2 frases prácticas según el clima de hoy y de los próximos días (qué ponerse, a qué hora llueve, si el fin de semana pinta bien para salir).',
    '- tuDia: 1-2 frases sobre su agenda de hoy (citas de tatuaje primero, con la hora). Si no hay nada agendado, déjalo vacío.',
    '- orizaba: TODOS los eventos próximos (de hoy en adelante) que encuentres en los titulares de EVENTOS, hasta 6: festivales, ferias, conciertos, teatro, exposiciones, carreras, fiestas. ' +
      '«cuando»: la fecha o rango si el titular la dice (ej. «Vie 13 – Dom 15 nov»), si no, «Próximamente»; «donde»: el lugar o ciudad si se sabe; «detalle»: 1 frase de qué es y por qué vale la pena. ' +
      'No pongas eventos que ya pasaron. Solo deja la lista vacía si de verdad no hay ningún evento en esos titulares.',
    '- local: 3-4 noticias de Orizaba y Veracruz útiles para el día a día (servicios, agua, obras, vialidades, clima, cultura, economía local), cada una en 1-2 frases. Evita la nota roja salvo que sea un aviso de seguridad importante.',
    `- plan: 1-2 frases con un plan concreto para hoy o el fin de semana según el clima y los eventos (si no hay evento, usa uno de estos lugares reales: ${PLACES.join(', ')}).`,
    '- noticias: las 3-4 noticias más importantes de México y el mundo, cada una en 2 frases (qué pasó y por qué importa). Nada de finanzas ni cripto.',
    '- ia.resumen: 2-3 frases con el panorama de la IA de esta semana, en tono de resumen, no de nota periodística.',
    '- ia.puntos: 3-4 avances nuevos o eventos importantes de IA tomados de los titulares de IA, cada uno en 1-2 frases: qué es y para qué sirve.',
    '- ia.aplicar: 3-4 ideas CONCRETAS de cómo aprovechar esos avances de hoy en SUS APPS Y PROYECTOS. Cada una: «proyecto» (el nombre de la app o proyecto), «avance» (en qué avance de hoy se basa, 2-6 palabras) e «idea» (1-2 frases: qué construir o cambiar y qué ganaría, algo que pueda empezar esta semana). Varía de proyecto; no inventes funciones de los modelos que no digan los titulares.',
    '- tech: 2-3 novedades de tecnología de los titulares de Tecnología que no sean IA ni cripto.',
    '- tatuaje: una idea ORIGINAL de tatuaje en su estilo; puede inspirarse en la temporada, en un evento de la región o en algo de hoy.',
    '- reflexion: 2-3 frases originales para arrancar el día con calma y enfoque (no cites a nadie).',
    '- dato: 1 dato curioso breve y verdadero (de preferencia sobre Orizaba, Veracruz o México).',
    '',
    'Devuelve EXACTAMENTE este JSON con estas claves (textos cortos y claros, sin URLs):',
    '{"saludo":"","climaTip":"","tuDia":"","orizaba":[{"titulo":"","cuando":"Vie 13 – Dom 15 nov","donde":"","detalle":""}],"local":[{"titulo":"","resumen":""}],"plan":"",' +
    '"noticias":[{"titulo":"","resumen":""}],"ia":{"resumen":"","puntos":[{"titulo":"","resumen":""}],"aplicar":[{"proyecto":"NOVA HUB","avance":"","idea":""}]},"tech":[{"titulo":"","resumen":""}],' +
    '"tatuaje":{"titulo":"","idea":"","elementos":"","paleta":"","zona":""},"reflexion":"","dato":""}'
  ].join('\n');
}

/* ───────── Parseo tolerante ───────── */
const str = v => (typeof v === 'string' ? v.replace(/<\/?cite[^>]*>/g, '').replace(/\*\*/g, '').trim() : '');
const items = (v, n, keys) => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object')
  .map(x => Object.fromEntries(keys.map(k => [k, str(x[k])]))).filter(x => x[keys[0]]).slice(0, n);
// Arregla los errores típicos de las IAs al escribir JSON: llaves/corchetes de más o de menos, comas sobrantes
// y saltos de línea sin escapar dentro de los textos.
export function repairJson(t) {
  let out = '', inStr = false, esc = false; const stack = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) { esc = false; out += c; continue; }
      if (c === '\\') { esc = true; out += c; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
      out += c === '\n' ? '\\n' : c === '\r' ? '' : c === '\t' ? ' ' : c; continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '{' || c === '[') { stack.push(c === '{' ? '}' : ']'); out += c; continue; }
    if (c === '}' || c === ']') {
      if (stack[stack.length - 1] !== c) continue;                    // cierre que no corresponde: sobra
      if (stack.length === 1 && /[^\s}\]]/.test(t.slice(i + 1))) continue; // cerraría todo antes de tiempo: sobra
      out = out.replace(/,\s*$/, ''); stack.pop(); out += c; continue;
    }
    out += c;
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length) out += stack.pop();
  return out;
}

export function parseBriefing(raw) {
  const txt = String(raw || '');
  let o = null;
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a >= 0 && b > a) { const body = txt.slice(a, b + 1); try { o = JSON.parse(body); } catch { try { o = JSON.parse(repairJson(body)); } catch { o = null; } } }
  if (!o || typeof o !== 'object') return null;
  const ia = o.ia && typeof o.ia === 'object' ? o.ia : {};
  const t = o.tatuaje && typeof o.tatuaje === 'object' ? o.tatuaje : {};
  const s = {
    saludo: str(o.saludo), climaTip: str(o.climaTip),
    tuDia: str(o.tuDia), plan: str(o.plan),
    orizaba: items(o.orizaba || o.eventos, 6, ['titulo', 'cuando', 'detalle', 'donde']),
    local: items(o.local, 4, ['titulo', 'resumen']),
    noticias: items(o.noticias, 4, ['titulo', 'resumen']),
    ia: {resumen: str(ia.resumen), puntos: items(ia.puntos, 4, ['titulo', 'resumen']), aplicar: items(ia.aplicar, 4, ['proyecto', 'idea', 'avance'])},
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
// agenda: líneas «HH:MM Título» de hoy (ver agendaLines).
export async function generateBriefing({name, nowMs = Date.now(), tz, place = DEFAULT_PLACE, fetchFn = fetch, server = false, env, headlines, agenda = [], projects = [], source = 'auto'} = {}) {
  const zone = tz || place.tz;
  const {dateStr, dateLabel} = localDate(nowMs, zone);
  const [weather, heads] = await Promise.all([fetchWeather(fetchFn, place), headlines ? Promise.resolve(headlines) : fetchHeadlines(fetchFn)]);
  const aiEnv = env && (env.AI || env.GROQ_KEY) ? env : undefined;
  const msgs = [{role: 'system', content: SYSTEM}, {role: 'user', content: buildPrompt({name, dateLabel, dateStr, weather, place, headlines: heads, agenda, projects})}];
  let raw = (await AI.chat(msgs, {fetchFn, server, env: aiEnv, task: 'json', maxTokens: 3800, temperature: .6, budget: server ? 240000 : 120000, timeout: 90000})).text;
  if (!parseBriefing(raw)) { // a veces el modelo se sale del formato: un segundo intento pidiendo solo el JSON
    msgs.push({role: 'assistant', content: raw.slice(0, 4000)}, {role: 'user', content: 'Devuélvelo de nuevo SOLO como el objeto JSON pedido, sin nada más.'});
    raw = (await AI.chat(msgs, {fetchFn, server, env: aiEnv, task: 'json', maxTokens: 3800, temperature: .3, budget: server ? 120000 : 60000, timeout: 90000})).text;
  }
  const sections = parseBriefing(raw);
  if (!sections) throw new Error('La IA no devolvió un briefing válido');
  // Si hubo anuncios de eventos y la IA no armó la lista, se muestran tal cual (los eventos nunca se pierden)
  const leads = eventLeads(heads);
  if (!sections.orizaba.length && leads.length) { sections.orizaba = leads.slice(0, 5); sections.eventosCrudos = true; }
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
