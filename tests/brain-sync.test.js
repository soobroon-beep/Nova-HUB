const assert = require('assert'), zlib = require('zlib');
const B = require('../scripts/brain-sync.js');
// Nova Hub: primera vez → «tenía»; luego crear, editar, completar tarea y borrar
const d1 = {notes: [{id: 1, title: 'Idea', body: 'tatuaje koi', tags: ['tattoo'], createdAt: '2026-11-01T10:00:00Z'}], projects: [{id: 2, name: 'Vortex', tasks: [{title: 'Bots', done: false}]}], habits: [{id: 3, name: 'Leer', logs: ['2026-11-09']}], diary: [{id: 1762800000000, mood: '😀', content: 'Buen día'}]};
let r = B.diff({}, B.novahubItems(d1), 1000, true);
assert.strictEqual(r.events.length, 6); assert(r.events.every(e => e.act === 'tenía'));
const d2 = JSON.parse(JSON.stringify(d1)); d2.notes[0].body = 'tatuaje koi con oro'; d2.projects[0].tasks[0].done = true; d2.habits[0].logs.push('2026-11-10'); d2.diary = []; d2.notes.push({id: 9, title: 'Nueva', body: 'x'});
const r2 = B.diff(r.next, B.novahubItems(d2), 2000, false), acts = r2.events.map(e => e.act + ':' + e.type).sort();
assert.deepStrictEqual(acts, ['borró:diario', 'completó:tarea', 'creó:nota', 'editó:nota', 'registró:hábito cumplido'].sort(), acts.join());
assert.strictEqual(B.diff(r2.next, B.novahubItems(d2), 3000, false).events.length, 0, 'sin cambios = sin eventos');
// VORTEX: estado comprimido, dibujos ruidosos callados, ideas long/short, diario de trades, bots
const st = {symbols: ['BTCUSDT', 'SOLUSDT'], indicators: {ema20: true, rsi: false}, alerts: [{id: 'a1', symbol: 'BTCUSDT', price: 70000, cond: 'cruza'}], drawings: {'BTCUSDT': [{id: 'd1', type: 'trend', pts: [{t: 1, p: 1}, {t: 2, p: 2}]}, {id: 'd2', type: 'long', pts: [{t: 1, p: 100}, {t: 2, p: 95}, {t: 3, p: 110}]}]}, pine: [{sid: 'cat:nova-nexus', on: true}], risk: {pct: 2, lev: 5, fee: .05}};
const doc = {stateZ: zlib.gzipSync(JSON.stringify(st)).toString('base64')};
const x = {state: B.vortexState(doc), scripts: {items: JSON.stringify([{id: 's1', name: 'Senales v2.7', code: '//@version=5\nindicator("x")'}])}, botlab: {items: JSON.stringify({bots: [{id: 'b1', name: 'Lucas 1H', mainV: 1, versions: [{v: 1, spec: {symbol: 'BTCUSDT', interval: '1h', entry: {long: []}}}]}]})}, botlabServer: {results: {b1: {status: 'ok', symbol: 'BTCUSDT', interval: '1h', monitor: {n: 30, winRate: 55, retPct: 12.5, maxDDPct: 8}}}}, journal: {items: JSON.stringify([{id: 'j1', side: 'long', sym: 'BTCUSDT', entry: 100, exit: 110, pnl: 50, r: 2, tClose: 1762800000000, src: 'demo'}])}};
const v1 = B.diff({}, B.vortexItems(x), 1, true);
const types = new Set(v1.events.map(e => e.type));
for (const t of ['seguimiento', 'alerta', 'dibujo', 'idea de trade', 'indicador', 'gestión de riesgo', 'script Pine', 'bot', 'resultado de bot', 'operación']) assert(types.has(t), 'falta ' + t);
assert(!v1.events.some(e => e.title === 'rsi'), 'indicador apagado no cuenta');
assert(/niveles 100 \/ 95 \/ 110/.test(v1.events.find(e => e.type === 'idea de trade').text));
const st2 = JSON.parse(JSON.stringify(st)); st2.drawings.BTCUSDT[0].pts[1].p = 3; st2.symbols = ['BTCUSDT']; st2.indicators.rsi = true;
const v2 = B.diff(v1.next, B.vortexItems(Object.assign({}, x, {state: st2})), 2, false).events.map(e => e.act + ':' + e.type).sort();
assert.deepStrictEqual(v2, ['activó:indicador', 'quitó de:seguimiento'], v2.join());
// contexto para VORTEX
const ctx = B.vortexContext([{name: 'Trading', instructions: 'Sé directo', notes: [{text: 'Nunca sin stop', master: true}, {text: 'Entrar en retroceso a la nube', kind: 'estrategia', author: 'X'}], learned: {text: 'Pierde más en 15m'}}]);
assert(/REGLAS MAESTRAS[\s\S]*Nunca sin stop/.test(ctx) && /estrategia · X/.test(ctx) && /Pierde más en 15m/.test(ctx));
console.log('brain-sync: OK');
// cerebros de bots
const bots = [{id: 'x1', name: 'Lucas 1H', mainV: 1, versions: [{v: 1, spec: {interval: '1h'}}]}, {id: 'x2', name: 'Nova Nexus Señales v2.7 4H', mainV: 1, versions: [{v: 1, spec: {interval: '4h'}}]}, {id: 'x3', name: 'Señales IA 2.7 bot', mainV: 2, versions: [{v: 1, spec: {interval: '4h'}}, {v: 2, spec: {interval: '1h'}, state: 'principal'}], paper: [{id: 'p1', v: 2, status: 'running', ledger: [{net: 10}, {net: -4}]}]}];
const L = {name: ['senal|signal', '2\\W?7'], interval: '1h'};
assert.strictEqual(B.matchBot(L, bots).id, 'x3', 'encuentra el bot de Señales 2.7 en 1h');
assert.strictEqual(B.matchBot(L, bots.slice(0, 2)), null);
const bits = B.botBits(bots[2]); assert(bits.some(x => x.type === 'versión del bot') && bits.some(x => x.type === 'paper trading' && /2 operaciones.*aciertos 50/.test(x.text)));
assert(/GANA: Objetivo 3R/.test(B.experimentText('Bot', {brain: {base: {oos: -10, n: 20}, tried: [{ok: true, title: 'Objetivo 3R', from: 'cerebro (IA)', oos: 30, base: -10, verdict: 'ok'}], best: {title: 'Objetivo 3R'}}})));
console.log('cerebros de bots: OK');
