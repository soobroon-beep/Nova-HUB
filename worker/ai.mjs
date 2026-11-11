// NOVA HUB · IA gratuita con modelos ABIERTOS y varias IAs de respaldo (la misma idea que VORTEX).
// Nadie escribe claves. Orden (cada paso solo si el anterior no contesta):
//   1) tu servidor NOVA HUB (/ai en nova-hub-push): Groq (si existe el secreto GROQ_KEY) → Cloudflare Workers AI
//      (cupo diario gratis: gpt-oss-120b, Llama 3.3 70B, Llama 4 Scout, Mistral Small, Gemma 3, Qwen…)
//   2) el servidor de VORTEX (/ai en vortex-push): su propia cadena Groq → Workers AI → Pollinations
//   3) Pollinations con la clave de la app (se acabaron los créditos, pero si vuelven a darlos se usa sola)
//   4) el servicio antiguo de Pollinations sin clave
// Si un servicio contesta «sin créditos» o con un filtro de seguridad en vez de la respuesta, se salta en el acto.
// Lo usan: index.html (chat, Agregar con IA, Resumen del día, briefing), pixel.js (Cortex) y el servidor de avisos (briefing 8:30).

export const POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT';      // clave de la app (Pollinations)
export const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions';
export const NH_URL = 'https://nova-hub-push.soobroon.workers.dev/ai';    // tu servidor de NOVA HUB
export const VX_URL = 'https://vortex-push.soobroon.workers.dev/ai';     // el servidor de VORTEX
export const OLD_URL = 'https://text.pollinations.ai/openai';            // servicio antiguo, sin clave
export const APP_ORIGIN = 'https://soobroon-beep.github.io';             // origen permitido por los servidores (para llamadas desde el servidor)
export const OPEN_MODELS = ['deepseek', 'mistral', 'qwen-coder'];        // Pollinations: open source, en orden de preferencia
export const BACKUP_MODELS = ['openai-fast', 'openai'];                  // Pollinations: solo si los abiertos no responden
export const LABEL = 'IA gratuita · modelos abiertos';

// IAs open source del servidor, por uso. Groq (rapidísimo, cuenta gratis) y Cloudflare Workers AI (cupo diario gratis).
export const OPEN_AI = {
  chat: {
    groq: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    wai: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/google/gemma-3-12b-it', '@cf/qwen/qwq-32b']
  },
  json: { // respuestas que deben ser JSON (briefing, Agregar con IA): modelos que respetan mejor el formato
    groq: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
    wai: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/openai/gpt-oss-120b', '@cf/mistralai/mistral-small-3.1-24b-instruct', '@cf/meta/llama-4-scout-17b-16e-instruct']
  }
};

export class AIError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind || 'other'; this.status = status || 0; } }
const kindOf = s => s === 429 ? 'rate' : s === 401 || s === 403 ? 'auth' : s === 402 || s === 404 || s === 400 || s === 422 ? 'model' : s >= 500 ? 'server' : 'other';
export const looksBad = t => /^\s*(safety|categories)\s*:/i.test(t) || /^\s*(safe|unsafe)\s*$/i.test(t);          // respuesta de un filtro, no de chat
export const noCredit = t => String(t || '').length < 800 && /enough credits|top up|paid pollen|insufficient (balance|credits)|requires? (a )?paid|free limit reached|queue full/i.test(t);
export const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
const textOf = j => {
  if (!j) return ''; if (typeof j === 'string') return j;
  const r = j.result || j; if (typeof r.response === 'string') return r.response;
  if (r.response && typeof r.response === 'object') return JSON.stringify(r.response); // Workers AI a veces devuelve el JSON ya interpretado
  const c = r.choices && r.choices[0]; if (c) { const m = c.message || {}; return typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : (c.text || ''); }
  if (typeof r.output_text === 'string') return r.output_text;
  if (Array.isArray(r.output)) return r.output.filter(o => o && o.type === 'message').flatMap(o => o.content || []).map(x => x.text || '').join('');
  return '';
};
const modelName = m => String(m).replace(/^@cf\/[^/]+\//, '').replace(/^(openai|meta-llama|qwen)\//, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wantsJson = msgs => (msgs || []).some(m => m && m.role === 'system' && /json/i.test(typeof m.content === 'string' ? m.content : ''));

/* ───────── En el servidor: Groq y Cloudflare Workers AI directo (sin pasar por internet) ───────── */
export async function serverChain(env, messages, o = {}, fetchFn = fetch) {
  const json = o.task === 'json' || (!o.task && wantsJson(messages)), T = OPEN_AI[json ? 'json' : 'chat']; // json: Groq valida que la respuesta sea JSON correcto
  const max_tokens = Math.min(+o.maxTokens || +o.max_tokens || 1200, 4000), temperature = Number.isFinite(+o.temperature) ? +o.temperature : .5;
  const end = Date.now() + (o.budget || 90000), left = () => end - Date.now(), tried = [];
  const routes = [];
  if (env && env.GROQ_KEY) for (const m of T.groq) routes.push(['Groq', m, async (msgs, ms) => {
    const r = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {method: 'POST', headers: {'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_KEY}, body: JSON.stringify(Object.assign({model: m, messages: msgs, max_tokens, temperature}, json ? {response_format: {type: 'json_object'}} : {})), signal: AbortSignal.timeout(ms)});
    if (!r.ok) throw new AIError('groq ' + r.status, kindOf(r.status), r.status); return textOf(await r.json());
  }]);
  if (env && env.AI) for (const m of T.wai) routes.push(['Cloudflare', m, (msgs, ms) => { let t; return Promise.race([env.AI.run(m, {messages: msgs, max_tokens, temperature}), new Promise((_, no) => { t = setTimeout(() => no(new AIError('tiempo', 'abort')), ms); })]).finally(() => clearTimeout(t)).then(textOf); }]);
  for (const [who, m, fn] of routes) {
    if (left() < 4000) break;
    try {
      const text = clean(await fn(messages, Math.min(o.timeout || 55000, left())));
      if (text && text.length > 1 && !looksBad(text) && !noCredit(text)) return {text, model: modelName(m) + ' · ' + who};
      tried.push(m + ': vacío');
    } catch (e) { tried.push(m + ': ' + String(e && e.message || e).slice(0, 60)); if (e && e.kind === 'rate') await sleep(800); }
  }
  if (tried.length) console.log('IA del servidor sin respuesta:', tried.join(' | '));
  return null;
}

/* ───────── Una llamada tipo OpenAI ───────── */
async function call(url, key, model, messages, o, fetchFn, ms, extra) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
  const headers = {'content-type': 'application/json'}; if (key) headers.authorization = 'Bearer ' + key;
  if (o.env || o.server) headers.origin = APP_ORIGIN; // desde el servidor no hay navegador que ponga el origen
  try {
    let r;
    try { r = await fetchFn(url, {method: 'POST', headers, body: JSON.stringify(Object.assign({model, messages, temperature: o.temperature == null ? .5 : o.temperature, max_tokens: o.maxTokens || 900}, extra || {})), signal: ctl ? ctl.signal : undefined}); }
    catch (e) { throw new AIError(ctl && ctl.signal.aborted ? 'Tiempo agotado' : 'Sin conexión', ctl && ctl.signal.aborted ? 'abort' : 'network'); }
    if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || j.message || ''; } catch {} throw new AIError(String(m || 'Error ' + r.status).slice(0, 160), kindOf(r.status), r.status); }
    const raw = await r.text(); let text; try { text = textOf(JSON.parse(raw)); } catch { text = raw; }
    text = clean(text);
    if (!text) throw new AIError('El modelo no devolvió texto', 'server');
    if (noCredit(text)) throw new AIError('Sin créditos en ' + url.split('/')[2], 'credit');
    if (looksBad(text)) throw new AIError('El modelo ' + model + ' no está disponible gratis ahora', 'model');
    return text;
  } finally { clearTimeout(to); }
}

// chat([{role, content}], {maxTokens, temperature, budget, timeout, fetchFn, env, server, task}) → {text, model}
//   env: en el servidor de avisos (Workers AI y Groq directos). task: 'chat' | 'json' (si no, se deduce del mensaje de sistema).
export async function chat(messages, o = {}) {
  const fetchFn = o.fetchFn || fetch, end = Date.now() + (o.budget || 90000), left = () => end - Date.now(), errs = [];
  const task = o.task || (wantsJson(messages) ? 'json' : 'chat');
  // 1) Servidor: directo a Groq / Workers AI
  if (o.env) { try { const r = await serverChain(o.env, messages, Object.assign({}, o, {task, budget: Math.min(left() - 5000, 150000)}), fetchFn); if (r) return r; } catch (e) { errs.push(e); } }
  // 2) Servidores propios (cada uno elige sus IAs abiertas). En el servidor de avisos se salta el propio (sería llamarse a sí mismo)
  const servers = o.env || o.server ? [VX_URL] : [NH_URL, VX_URL];
  for (const url of servers) {
    if (left() < 5000) break;
    try { const text = await call(url, '', 'openai', messages, o, fetchFn, Math.min(o.timeout || 60000, left()), {task: url === NH_URL ? task : 'chat'}); return {text, model: url === NH_URL ? 'servidor NOVA HUB' : 'servidor VORTEX'}; }
    catch (e) { errs.push(e); }
  }
  // 3) Pollinations con la clave de la app
  let gen = true;
  for (const model of [...OPEN_MODELS, ...BACKUP_MODELS]) {
    if (!gen || left() < 4000) break;
    try { return {text: await call(GEN_URL, POLLEN_KEY, model, messages, o, fetchFn, Math.min(o.timeout || 45000, left())), model}; }
    catch (e) { errs.push(e); if (e.kind === 'credit' || e.kind === 'auth' || e.status === 402 || e.kind === 'network') gen = false; else if (e.kind === 'rate') await sleep(1200); } // sin créditos: no insistir con otros modelos
  }
  // 4) Último recurso: el servicio antiguo sin clave
  if (left() > 6000) { try { return {text: await call(OLD_URL, '', 'openai', messages, o, fetchFn, Math.min(40000, left())), model: 'pollinations'}; } catch (e) { errs.push(e); } }
  const e = errs.find(x => x.kind === 'network') || errs[errs.length - 1] || new AIError('La IA no respondió a tiempo', 'abort');
  throw new AIError(e.kind === 'network' ? 'No hay conexión con la IA. Revisa tu internet.' : e.kind === 'rate' ? 'La IA gratuita está saturada, intenta en unos segundos.' : 'La IA no respondió: ' + e.message, e.kind, e.status);
}

// Atajo: un mensaje con instrucciones de sistema → texto
export async function ask(prompt, system, o = {}) {
  const msgs = system ? [{role: 'system', content: system}, {role: 'user', content: prompt}] : [{role: 'user', content: prompt}];
  return (await chat(msgs, o)).text;
}

/* ───────── Ruta /ai del servidor de avisos (la usan NOVA HUB y Neural Brain) ───────── */
export const ALLOWED_ORIGINS = ['https://soobroon-beep.github.io'];
const hits = new Map(); // límite por IP: que nadie gaste el cupo gratis a lo loco
export function allowed(ip, now = Date.now()) { const h = (hits.get(ip) || []).filter(t => now - t < 60000); if (h.length >= 30) return false; h.push(now); hits.set(ip, h); if (hits.size > 5000) hits.clear(); return true; }
export async function aiRoute(req, env, fetchFn = fetch) {
  const origin = req.headers.get('origin') || '', ok = !origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const cors = {'access-control-allow-origin': origin && ok ? origin : '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400', vary: 'origin'};
  const json = (o, status = 200) => new Response(JSON.stringify(o), {status, headers: {...cors, 'content-type': 'application/json', 'cache-control': 'no-store'}});
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
  if (!ok) return json({error: 'Origen no permitido'}, 403);
  const path = new URL(req.url).pathname;
  if (path === '/ai/status') return json({ok: true, ready: !!(env.AI || env.GROQ_KEY), groq: !!env.GROQ_KEY, cloudflare: !!env.AI});
  if (req.method !== 'POST') return json({error: 'Usa POST'}, 405);
  if (!allowed(req.headers.get('cf-connecting-ip') || 'x')) return json({error: 'Demasiadas consultas seguidas; espera un minuto'}, 429);
  if (path === '/ai/transcribe') { // dictado por voz (Cortex en la PC): Whisper open source, gratis
    let b; try { b = JSON.parse(await req.text()); } catch { return json({error: 'JSON inválido'}, 400); }
    const audio = String(b.audio || ''); if (!audio || audio.length > 6000000) return json({error: 'Audio vacío o muy largo'}, 400);
    const text = await transcribe(env, audio, b.language || 'es', fetchFn).catch(() => null);
    return text == null ? json({error: 'No se pudo transcribir'}, 503) : json({text});
  }
  const raw = await req.text(); if (raw.length > 400000) return json({error: 'La consulta es demasiado grande'}, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({error: 'JSON inválido'}, 400); }
  const msgs = (Array.isArray(b.messages) ? b.messages.slice(-16) : []).map(m => ({role: ['system', 'user', 'assistant'].includes(m && m.role) ? m.role : 'user', content: typeof (m && m.content) === 'string' ? m.content : Array.isArray(m && m.content) ? m.content.filter(p => p && p.type === 'text').map(p => p.text).join('\n') : ''}));
  if (!msgs.length) return json({error: 'Sin mensajes'}, 400);
  const task = b.task === 'json' ? 'json' : (wantsJson(msgs) ? 'json' : 'chat');
  const r = await serverChain(env, msgs, {task, max_tokens: b.max_tokens, temperature: b.temperature, budget: 80000}, fetchFn).catch(() => null);
  if (!r) return json({error: 'Las IAs del servidor no respondieron'}, 503);
  return json({object: 'chat.completion', model: r.model, choices: [{index: 0, message: {role: 'assistant', content: r.text}, finish_reason: 'stop'}]});
}

// Whisper: Groq (si hay clave) → Cloudflare Workers AI. audio = WAV en base64. Devuelve el texto (o null)
export async function transcribe(env, audioB64, language = 'es', fetchFn = fetch) {
  if (env && env.GROQ_KEY) {
    try {
      const bin = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0)), fd = new FormData();
      fd.append('file', new Blob([bin], {type: 'audio/wav'}), 'voz.wav'); fd.append('model', 'whisper-large-v3-turbo'); fd.append('language', language); fd.append('response_format', 'json');
      const r = await fetchFn('https://api.groq.com/openai/v1/audio/transcriptions', {method: 'POST', headers: {authorization: 'Bearer ' + env.GROQ_KEY}, body: fd, signal: AbortSignal.timeout(30000)});
      if (r.ok) { const j = await r.json(); if (typeof j.text === 'string') return j.text.trim(); }
    } catch {}
  }
  if (env && env.AI) {
    for (const m of ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper']) {
      try {
        const inp = m.endsWith('turbo') ? {audio: audioB64, language, task: 'transcribe'} : {audio: [...Uint8Array.from(atob(audioB64), c => c.charCodeAt(0))]};
        const r = await env.AI.run(m, inp); if (r && typeof r.text === 'string') return r.text.trim();
      } catch {}
    }
  }
  return null;
}
