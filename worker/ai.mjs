// NOVA HUB · IA gratuita con modelos ABIERTOS (sin claves de Claude, OpenAI ni Gemini).
// La misma idea que VORTEX: Pollinations (servicio gratuito, API compatible con OpenAI) con la clave de la app fija,
// para que nadie tenga que escribir claves. Primero modelos open source (DeepSeek, Mistral, Qwen); si todos fallan
// en ese momento, un último respaldo del mismo servicio gratuito para que la app nunca se quede sin IA.
// Lo usan: index.html (chat, Agregar con IA, Resumen del día, briefing), pixel.js (Nova Pixel) y el servidor de avisos.

export const POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT';      // clave de la app (Pollinations, gratuita)
export const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions';
export const VX_URL = 'https://vortex-push.soobroon.workers.dev/ai';     // tu servidor (el mismo de VORTEX) reenvía con la clave
export const OLD_URL = 'https://text.pollinations.ai/openai';            // servicio antiguo, sin clave
export const OPEN_MODELS = ['deepseek', 'mistral', 'qwen-coder'];        // open source, en orden de preferencia
export const BACKUP_MODELS = ['openai-fast', 'openai'];                  // solo si los abiertos no responden
export const LABEL = 'IA gratuita · modelo abierto';

export class AIError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind || 'other'; this.status = status || 0; } }
const kindOf = s => s === 429 ? 'rate' : s === 401 || s === 403 ? 'auth' : s === 402 || s === 404 || s === 400 || s === 422 ? 'model' : s >= 500 ? 'server' : 'other';
export const looksBad = t => /^\s*(safety|categories)\s*:/i.test(t) || /^\s*(safe|unsafe)\s*$/i.test(t);          // respuesta de un filtro, no de chat
export const noCredit = t => String(t || '').length < 800 && /enough credits|top up|paid pollen|insufficient (balance|credits)|requires? (a )?paid/i.test(t);
export const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const textOf = j => { const c = j && j.choices && j.choices[0]; if (!c) return ''; const m = c.message || {}; return typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : (c.text || ''); };

async function call(url, key, model, messages, o, fetchFn, ms) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl ? setTimeout(() => ctl.abort(), ms) : 0;
  const headers = {'content-type': 'application/json'}; if (key) headers.authorization = 'Bearer ' + key;
  try {
    let r;
    try { r = await fetchFn(url, {method: 'POST', headers, body: JSON.stringify({model, messages, temperature: o.temperature == null ? .5 : o.temperature, max_tokens: o.maxTokens || 900}), signal: ctl ? ctl.signal : undefined}); }
    catch (e) { throw new AIError(ctl && ctl.signal.aborted ? 'Tiempo agotado' : 'Sin conexión', ctl && ctl.signal.aborted ? 'abort' : 'network'); }
    if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || j.message || ''; } catch {} throw new AIError(String(m || 'Error ' + r.status).slice(0, 160), kindOf(r.status), r.status); }
    const raw = await r.text(); let text; try { text = textOf(JSON.parse(raw)); } catch { text = raw; }
    text = clean(text);
    if (!text) throw new AIError('El modelo no devolvió texto', 'server');
    if (looksBad(text) || noCredit(text)) throw new AIError('El modelo ' + model + ' no está disponible gratis ahora', 'model');
    return text;
  } finally { clearTimeout(to); }
}

// chat([{role, content}], {maxTokens, temperature, budget, fetchFn, server}) → {text, model}
export async function chat(messages, o = {}) {
  const fetchFn = o.fetchFn || fetch, end = Date.now() + (o.budget || 90000), left = () => end - Date.now();
  const routes = o.server ? [[GEN_URL, POLLEN_KEY]] : [[GEN_URL, POLLEN_KEY], [VX_URL, '']];
  const errs = [];
  for (const model of [...OPEN_MODELS, ...BACKUP_MODELS]) {
    for (const [url, key] of routes) {
      if (left() < 4000) break;
      try { return {text: await call(url, key, model, messages, o, fetchFn, Math.min(o.timeout || 45000, left())), model}; }
      catch (e) { errs.push(e); if (e.kind === 'model' || e.kind === 'abort') break; if (e.kind === 'rate') await new Promise(r => setTimeout(r, 1200)); }
    }
  }
  if (left() > 6000) { // último recurso: el servicio antiguo sin clave
    try { return {text: await call(OLD_URL, '', 'mistral', messages, o, fetchFn, Math.min(40000, left())), model: 'mistral'}; } catch (e) { errs.push(e); }
  }
  const e = errs.find(x => x.kind === 'network') || errs[errs.length - 1] || new AIError('La IA no respondió a tiempo', 'abort');
  throw new AIError(e.kind === 'network' ? 'No hay conexión con la IA. Revisa tu internet.' : e.kind === 'rate' ? 'La IA gratuita está saturada, intenta en unos segundos.' : 'La IA no respondió: ' + e.message, e.kind, e.status);
}

// Atajo: un mensaje con instrucciones de sistema → texto
export async function ask(prompt, system, o = {}) {
  const msgs = system ? [{role: 'system', content: system}, {role: 'user', content: prompt}] : [{role: 'user', content: prompt}];
  return (await chat(msgs, o)).text;
}
