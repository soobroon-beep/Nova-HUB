/* NOVA PIXEL · tu asistente en TODO NOVA HUB (PC y celular). Es el hermano de Nexus Pixel (VORTEX), pero aquí no hay trading:
   está enfocado en tus notas, proyectos, tareas, recordatorios, calendario (incluidas tus citas de 🔥Tatuajes🔥), hábitos y diario.
   Se asoma escondido (media cabeza y su halo) y, al tocarlo, sale volando. Pídele en español:
   «anota una idea: …», «crea el proyecto X con estas tareas…», «recuérdame mañana a las 5 llamar a…», «¿qué tengo hoy?»,
   «¿qué me falta del proyecto…?», «marca el hábito de leer», «resume mis notas de…», «¿dónde cambio el ícono?».
   Lo que crea se guarda como lo tuyo (en tu cuenta de Google y en la nube) y vuela a escribirlo con su stylus; siempre puedes Deshacer.
   La IA: si configuraste tu propia clave en Ajustes → IA Asistente, usa esa; si no, usa la IA gratuita de tu servidor (sin pedir claves).
   Arrástralo de lado a lado para girarlo 360°, tócalo para que salude y arrastra la barra de su globo para cambiarlo de lugar.
   El modelo 3D (pixel-model.js + three.js) solo se descarga al abrirlo. Los datos los da el puente window.NovaHubBridge (index.html). */
(function () {
  'use strict';
  const H = () => window.NovaHubBridge; if (!H()) return;
  const CFG = () => { try { return H().cfg() || {}; } catch { return {}; } };
  const KEY = 'nh_pixel_v1', ls = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } })(), store = () => { try { localStorage.setItem(KEY, JSON.stringify(ls)); } catch {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms)), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mobile = () => innerWidth <= 900;
  const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const VX = 'https://vortex-push.soobroon.workers.dev'; // tu servidor (el mismo de VORTEX): reenvía la IA gratuita con la clave de la app
  const GEN_URL = 'https://gen.pollinations.ai/v1/chat/completions', POLLEN_KEY = 'sk_1XvEYtOmiFixsgMve0FAqQz5ghhy7FFT'; // respaldo directo (Pollinations, gratuito)
  const accent = () => { const c = CFG().color; if (c && c !== 'auto') return c; try { return H().accent() || '#38d9ff'; } catch { return '#38d9ff'; } };

  /* Cabeza de Cortex en SVG (ligera, sin 3D): se asoma escondida y sale en la tarjeta de la IA */
  let hid = 0;
  function headSVG(mode) { // Cortex: cerebro de neón (cian / violeta) con circuitos y su anillo orbital
    const i = ++hid, A = 'var(--px-acc,#38d9ff)', V = '#a46bff';
    const hemi = k => k < 0
      ? 'M58 30C51 22 38 21 32 28C23 28 17 37 19 45C12 50 12 61 18 66C15 75 22 83 31 82C36 89 49 90 58 84Z'
      : 'M62 30C69 22 82 21 88 28C97 28 103 37 101 45C108 50 108 61 102 66C105 75 98 83 89 82C84 89 71 90 62 84Z';
    const lines = k => { const m = x => k < 0 ? x : 120 - x; return `<path d="M${m(57)} 40H${m(45)}L${m(39)} 34M${m(57)} 52H${m(41)}L${m(33)} 46M${m(57)} 64H${m(44)}L${m(36)} 70M${m(57)} 75H${m(47)}M${m(30)} 56H${m(24)}" fill="none"/><g class="nph-node"><circle cx="${m(39)}" cy="34" r="2.6"/><circle cx="${m(33)}" cy="46" r="2.6"/><circle cx="${m(36)}" cy="70" r="2.6"/><circle cx="${m(47)}" cy="75" r="2.2"/><circle cx="${m(24)}" cy="56" r="2.2"/></g>`; };
    return `<svg class="nph nph-cortex" viewBox="0 0 120 110" aria-hidden="true"><defs>
      <radialGradient id="nhL${i}" cx=".45" cy=".35" r=".8"><stop offset="0" style="stop-color:${A}" stop-opacity=".55"/><stop offset="1" stop-color="#0b0d2c" stop-opacity=".95"/></radialGradient>
      <radialGradient id="nhR${i}" cx=".55" cy=".35" r=".8"><stop offset="0" stop-color="${V}" stop-opacity=".55"/><stop offset="1" stop-color="#140b2e" stop-opacity=".95"/></radialGradient>
      <filter id="npg${i}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g class="nph-halo"><path d="M6 56A54 11 0 0 1 114 56" fill="none" style="stroke:${A}" stroke-width="2.2" opacity=".75" filter="url(#npg${i})"/></g>
      <g class="nph-face" filter="url(#npg${i})" stroke-linecap="round" stroke-linejoin="round">
        <path d="${hemi(-1)}" fill="url(#nhL${i})" style="stroke:${A}" stroke-width="2.6"/>
        <path d="${hemi(1)}" fill="url(#nhR${i})" stroke="${V}" stroke-width="2.6"/>
        <g style="stroke:${A};fill:${A}" stroke-width="2">${lines(-1)}</g>
        <g stroke="${V}" fill="${V}" stroke-width="2">${lines(1)}</g>
        <ellipse cx="40" cy="33" rx="9" ry="3" fill="#fff" opacity=".22" stroke="none"/><ellipse cx="80" cy="33" rx="9" ry="3" fill="#fff" opacity=".18" stroke="none"/>
      </g>
      <g class="nph-halo"><path d="M6 56A54 11 0 0 0 114 56" fill="none" style="stroke:${A}" stroke-width="2.6" filter="url(#npg${i})"/><circle class="nph-star" cx="99" cy="63" r="3" fill="#e9fbff"/></g>
      <path d="M52 92h16l-3 6-5 5-5-5z" fill="#2b2846" stroke="${V}" stroke-width="1"/><path d="M60 94l2.5 4-2.5 4-2.5-4z" style="fill:${A}" filter="url(#npg${i})"/></svg>`;
  }
  window.NovaPixelHead = headSVG;

  /* ── DOM ── */
  const layer = document.createElement('div'); layer.className = 'px-layer'; layer.style.setProperty('--px-acc', accent());
  const fab = document.createElement('button'); fab.type = 'button'; fab.className = 'px-peek'; fab.title = 'Cortex · tócalo para que salga'; fab.setAttribute('aria-label', 'Llamar a Cortex');
  fab.innerHTML = `<span class="px-peek-in">${headSVG('eyes')}</span>`; // escondido: solo se asoman media cabeza y el halo
  const ink = document.createElement('canvas'); ink.className = 'px-ink'; ink.setAttribute('aria-hidden', 'true');
  const av = document.createElement('div'); av.className = 'px-av'; av.hidden = true; av.innerHTML = '<canvas class="px-cv" aria-label="Cortex: arrástralo de lado a lado para girarlo; tócalo para que salude"></canvas><span class="px-spin" aria-hidden="true"></span>';
  const bub = document.createElement('div'); bub.className = 'px-bub'; bub.hidden = true; bub.setAttribute('role', 'dialog'); bub.setAttribute('aria-label', 'Cortex');
  bub.innerHTML = `<div class="px-hd" title="Arrastra para moverlo"><span class="px-dot"></span><b>Cortex</b><small class="px-st">IA de NOVA HUB</small><button type="button" class="px-x" data-px="close" aria-label="Despedir a Nova Pixel">&times;</button></div>
    <div class="px-msg" aria-live="polite"></div>
    <div class="px-chips"></div>
    <form class="px-in"><input type="text" placeholder="Pídeme algo: «anota una idea…»" autocomplete="off" enterkeyhint="send" aria-label="Escríbele a Cortex"><button type="button" class="px-mic" aria-label="Hablarle a Cortex" title="Háblale"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button type="submit" class="px-send" aria-label="Enviar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>`;
  const tip = document.createElement('button'); tip.type = 'button'; tip.className = 'px-tip'; tip.hidden = true;
  layer.append(ink, av, bub, fab, tip); document.body.appendChild(layer);
  const cv = av.querySelector('.px-cv'), msg = bub.querySelector('.px-msg'), input = bub.querySelector('input'), st = bub.querySelector('.px-st');

  /* ── estado y posiciones ── */
  let M = null, loading = null, open = false, busy = false, pos = {x: 0, y: 0}, lastAct = Date.now(), hist = [], typer = 0, lastBatch = null;
  const AV = () => mobile() ? {w: 112, h: 132} : {w: 150, h: 176};
  const AW = () => layer.clientWidth || innerWidth, AH = () => layer.clientHeight || innerHeight;
  const tabbar = () => { // la barra inferior: #tabbar en el celular, #novaFloatingDock en la PC (la que esté visible)
    if (document.body.classList.contains('kb-open')) return null;
    for (const id of ['tabbar', 'novaFloatingDock']) { const t = document.getElementById(id); if (!t || t.classList.contains('tb-hide')) continue; const cs = getComputedStyle(t); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .2) continue; const r = t.getBoundingClientRect(); if (r.height && r.top < AH() - 10) return r; }
    return null; };
  const bottomGap = () => { const t = tabbar(); return t ? AH() - t.top + 8 : 0; };
  const createBtn = () => { // el botón (+) de crear en la PC (junto a la barra inferior flotante)
    const b = document.getElementById('novaCreateFab'); if (!b || mobile()) return null; const r = b.getBoundingClientRect(); return r.width && r.top < AH() ? r : null; };
  function home() {
    const s = AV(), c = createBtn();
    // PC: descansa flotando abajo a la derecha, pegado al botón (+) de crear
    if (c) return {x: clamp(c.right + 6, 0, AW() - s.w), y: clamp(c.top - s.h + 18, 0, AH() - s.h - 24)}; // más arriba: los pies quedan a la altura del (+), sin cortarse
    const h = ls.home2; if (mobile() && h && Number.isFinite(h.rx) && Number.isFinite(h.by)) return {x: clamp(AW() - h.rx - s.w, 0, AW() - s.w), y: clamp(AH() - h.by - s.h, 0, AH() - bottomGap() - s.h - 6)};
    if (mobile()) return {x: 6, y: clamp(AH() - bottomGap() - s.h - 6, 0, AH() - s.h)}; // celular: a la izquierda, sobre la barra (el (+) queda libre a la derecha)
    return {x: AW() - s.w - 36, y: clamp(AH() - Math.max(bottomGap(), 24) - s.h - 4, 0, AH() - s.h)}; // PC: abajo a la derecha, arriba de la barra
  }
  function placePeek() { // escondido: sobre la barra inferior (celular) o abajo a la derecha, junto al menú (PC)
    // Se ve la cabeza COMPLETA (ya no se recorta) y siempre por encima de la barra inferior
    const w = fab.offsetWidth || 54, hgt = fab.offsetHeight || 56, t = tabbar(), c = createBtn();
    if (c) { fab.style.left = (c.right + 12) + 'px'; fab.style.top = Math.max(6, c.top - hgt * .45) + 'px'; } // PC: junto al (+), un poco más arriba
    else if (t) { fab.style.left = (t.left + 22) + 'px'; fab.style.top = (t.top - hgt - 8) + 'px'; }
    else if (mobile()) { fab.style.left = '22px'; fab.style.top = (AH() - hgt - 16) + 'px'; }
    else { fab.style.left = (AW() - 108 - w) + 'px'; fab.style.top = (AH() - hgt - 24) + 'px'; }
  }
  function peekSpot() { const r = fab.getBoundingClientRect(); return r.width ? {x: r.left + r.width / 2, y: r.top} : {x: 60, y: AH() - 40}; }
  function place(x, y) { const s = AV(); pos = {x, y}; av.style.width = s.w + 'px'; av.style.height = s.h + 'px'; av.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; if (!bub.hidden) placeBubble(); }
  function placeBubble() { // a un lado del robot; si no cabe, arriba (o abajo). Nunca encima de la barra inferior
    const s = AV(), lg = bub.classList.contains('long'), bw = Math.min(lg ? (mobile() ? 380 : 420) : (mobile() ? 270 : 310), AW() - 16); bub.style.width = bw + 'px'; const bh = bub.offsetHeight || 180;
    let x, y, side;
    if (pos.x - bw + 14 >= 8) { x = pos.x - bw + 14; y = pos.y + s.h * .1; side = 'l'; }
    else if (pos.x + s.w - 10 + bw <= AW() - 8) { x = pos.x + s.w - 10; y = pos.y + s.h * .1; side = 'r'; }
    else { x = pos.x + s.w / 2 - bw / 2; y = pos.y - bh + 4; side = 't'; if (y < 6) { y = pos.y + s.h - 4; side = 'b'; } }
    bub.style.transform = `translate3d(${clamp(x, 8, AW() - bw - 8).toFixed(0)}px,${clamp(y, 6, AH() - bottomGap() - bh - 6).toFixed(0)}px,0)`; bub.dataset.side = side;
  }
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function flyTo(x, y, ms) {
    const s = AV(); x = clamp(x, -s.w * .25, AW() - s.w * .75); y = clamp(y, -s.h * .2, AH() - s.h * .2);
    const x0 = pos.x, y0 = pos.y, dist = Math.hypot(x - x0, y - y0); ms = ms || clamp(dist * 1.6, 260, 1100); if (REDUCED) ms = 1;
    const far = dist > 90, prev = M ? M.pose : 'idle'; if (M && far) { M.setPose('fly'); M.setYaw(x > x0 ? .55 : -.55); }
    return new Promise(res => { const t0 = performance.now(); let lx = x0, ly = y0;
      const step = now => { const k = Math.min(1, (now - t0) / ms), e = ease(k), nx = x0 + (x - x0) * e, ny = y0 + (y - y0) * e - Math.sin(k * Math.PI) * Math.min(60, dist * .12); if (M) M.setVel((nx - lx) * 12, (ny - ly) * 12); lx = nx; ly = ny; place(nx, ny);
        if (k < 1) requestAnimationFrame(step); else { if (M) { M.setVel(0, 0); M.setYaw(0); if (far) M.setPose(prev === 'fly' ? 'idle' : prev); } res(); } };
      requestAnimationFrame(step); });
  }

  /* ── globo de texto ── */
  function say(text, opts = {}) {
    clearInterval(typer); bub.hidden = false; placeBubble(); bub.classList.toggle('busy', !!opts.busy);
    if (REDUCED || opts.instant) { msg.textContent = text; placeBubble(); return; }
    let i = 0; msg.textContent = ''; typer = setInterval(() => { i += 2; msg.textContent = text.slice(0, i); if (i % 12 === 0) placeBubble(); if (i >= text.length) { clearInterval(typer); placeBubble(); } }, 16);
  }
  const status = t => { st.textContent = t; };
  const mood = (e, p) => { if (!M) return; if (e) M.setExpr(e); if (p) M.setPose(p); };
  const big = on => { bub.classList.toggle('long', !!on); if (!bub.hidden) placeBubble(); };

  /* ── escribir: el trazo que sale de su stylus subraya lo que acaba de crear ── */
  let inkCtx = null;
  function sizeInk() { const d = Math.min(2, devicePixelRatio || 1); ink.width = Math.round(AW() * d); ink.height = Math.round(AH() * d); inkCtx = ink.getContext('2d'); inkCtx.setTransform(d, 0, 0, d, 0, 0); }
  async function writeOn(el) {
    if (!el) return; try { el.scrollIntoView({block: 'center', behavior: REDUCED ? 'auto' : 'smooth'}); } catch {} await sleep(REDUCED ? 0 : 420);
    const r = el.getBoundingClientRect(); if (!r.width) return; const s = AV(), hand0 = M ? M.handScreen() : {x: s.w * .8, y: s.h * .55};
    const a = {x: r.left + 12, y: r.bottom - 6}, b = {x: Math.min(r.right - 12, r.left + Math.max(60, r.width * .8)), y: r.bottom - 6};
    mood('focused', 'point'); await flyTo(a.x - hand0.x, a.y - hand0.y); mood('focused', 'draw'); sizeInk(); ink.classList.remove('fade');
    const col = accent(), len = b.x - a.x, ms = REDUCED ? 1 : clamp(len * 2.2, 380, 950), t0 = performance.now(), wave = (k) => Math.sin(k * Math.PI * 6) * 2.2;
    await new Promise(res => { const step = now => { const k = Math.min(1, (now - t0) / ms), tipX = a.x + len * k, tipY = a.y + wave(k);
      inkCtx.clearRect(0, 0, AW(), AH()); inkCtx.save(); inkCtx.strokeStyle = col; inkCtx.lineWidth = 3; inkCtx.lineCap = 'round'; inkCtx.shadowColor = col; inkCtx.shadowBlur = 12; inkCtx.beginPath();
      for (let q = 0; q <= k + 1e-6; q += .02) { const x = a.x + len * q, y = a.y + wave(q); q ? inkCtx.lineTo(x, y) : inkCtx.moveTo(x, y); } inkCtx.stroke(); inkCtx.restore();
      if (M) { const hd = M.handScreen(); place(tipX - hd.x, tipY - hd.y); }
      if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    spot(el); setTimeout(() => { ink.classList.add('fade'); setTimeout(() => inkCtx && inkCtx.clearRect(0, 0, AW(), AH()), 300); }, 900);
  }
  function spot(el, ms = 4200) { if (!el) return; el.classList.add('px-spot'); setTimeout(() => el.classList.remove('px-spot'), ms); }
  async function pointAt(el) {
    if (!el) return false; try { el.scrollIntoView({block: 'center', behavior: REDUCED ? 'auto' : 'smooth'}); } catch {} await sleep(380); const r = el.getBoundingClientRect(), s = AV(); if (!r.width) return false;
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2, left = tx > AW() / 2, x = clamp(left ? tx - s.w - 16 : tx + 16, 0, AW() - s.w), y = clamp(ty - s.h * .45, 0, AH() - bottomGap() - s.h);
    mood('excited', 'point'); M && M.setYaw(left ? .5 : -.5); await flyTo(x, y, 700); spot(el); setTimeout(() => { if (M) M.setYaw(0); }, 2400); return true;
  }

  /* ════════ Secciones, sugerencias y «¿dónde está…?» ════════ */
  const NAMES = {dashboard: 'Dashboard', calendar: 'Calendario', notes: 'Notas', projects: 'Proyectos', reminders: 'Recordatorios', diary: 'Diario', habits: 'Hábitos', briefing: 'Briefing diario', relax: 'Zona Relax', ai: 'IA Asistente', settings: 'Ajustes'};
  const CHIPS = {
    dashboard: [['¿Qué tengo hoy?', '¿Qué tengo hoy?'], ['Prioriza mis pendientes', 'Ayúdame a priorizar mis pendientes de hoy'], ['Plan de la semana', 'Arma un plan para mi semana con lo que tengo'], ['Anotar una idea', 'Anota una idea: ']],
    notes: [['Nueva nota', 'Anota: '], ['Resume mis notas', 'Resume mis notas más recientes'], ['Busca en mis notas', 'Busca en mis notas: '], ['Ideas para tatuajes', '¿Qué ideas de tatuajes tengo anotadas?']],
    projects: [['¿Qué sigue?', '¿Qué debería hacer primero en mis proyectos?'], ['Pendientes', '¿Qué tareas pendientes tengo en mis proyectos?'], ['Nuevo proyecto', 'Crea un proyecto llamado '], ['Divide en tareas', 'Divide en tareas mi proyecto ']],
    reminders: [['Recuérdame…', 'Recuérdame mañana a las 10 '], ['Próximos', '¿Qué recordatorios tengo próximos?'], ['Vencidos', '¿Tengo recordatorios vencidos?']],
    calendar: [['¿Qué tengo hoy?', '¿Qué tengo hoy en el calendario?'], ['Citas de tatuaje', '¿Qué citas de tatuaje tengo esta semana?'], ['Agendar evento', 'Agenda un evento ']],
    diary: [['Escribir en mi diario', 'Escribe en mi diario: '], ['¿Cómo va mi semana?', '¿Cómo ha ido mi semana según mi diario?']],
    habits: [['¿Cómo voy?', '¿Cómo voy con mis hábitos?'], ['Marcar un hábito', 'Marca como hecho el hábito '], ['Nuevo hábito', 'Crea el hábito ']],
    briefing: [['¿Qué tengo hoy?', '¿Qué tengo hoy?'], ['Prioriza mi día', 'Ayúdame a priorizar mi día']],
    ai: [['¿Qué puedes hacer?', '¿Qué puedes hacer por mí en Nova Hub?'], ['¿Qué tengo hoy?', '¿Qué tengo hoy?']],
    settings: [['¿Dónde cambio el ícono?', '¿Dónde cambio el ícono de la app?'], ['Hacer respaldo', '¿Dónde hago un respaldo de mis datos?'], ['Conectar Calendar', '¿Dónde conecto Google Calendar?']]
  };
  const section = () => { try { return H().view() || 'dashboard'; } catch { return 'dashboard'; } };
  const chipsHTML = list => list.map(([t, q]) => `<button type="button" data-q="${esc(q)}">${esc(t)}</button>`).join('');
  function setChips() { const sec = section(); bub.querySelector('.px-chips').innerHTML = chipsHTML(CHIPS[sec] || CHIPS.dashboard); input.placeholder = sec === 'reminders' ? 'Ej.: recuérdame mañana a las 5 llamar a…' : sec === 'projects' ? 'Ej.: agrega «comprar tintas» a Estudio…' : sec === 'notes' ? 'Ej.: anota una idea para un tatuaje…' : 'Pídeme o pregúntame algo…'; }
  const setChipsCustom = list => { bub.querySelector('.px-chips').innerHTML = chipsHTML(list); };

  const SET = t => `h3:${t}`; // en Ajustes busco la sección por su título
  const PLACES = [ // [palabras, nombre, sección, selector, explicación]
    [/icono|logo de la app/, 'Icono de la app', 'settings', SET('icono de la app'), 'Elige el ícono; también cambia el color de la app.'],
    [/color de acento|color de la app|cambiar (el )?color/, 'Color de acento', 'settings', SET('color de acento'), 'El color principal de toda la app.'],
    [/fondo|apariencia/, 'Apariencia del fondo', 'settings', SET('apariencia del fondo'), 'El fondo animado que cambia con la hora.'],
    [/widget/, 'Widgets del Dashboard', 'settings', SET('widgets del dashboard'), 'Qué tarjetas salen en tu Dashboard.'],
    [/barra inferior|dock|pestanas/, 'Barra inferior', 'settings', SET('barra inferior'), 'Qué pestañas salen abajo y su color.'],
    [/notificacion|avisos|push/, 'Notificaciones', 'settings', SET('notificaciones'), 'Avisos de recordatorios, también con la app cerrada.'],
    [/respaldo|backup|exportar|importar|json/, 'Datos y respaldo', 'settings', SET('datos'), 'Exporta o importa tu respaldo JSON.'],
    [/papelera|borrad/, 'Papelera', 'settings', SET('papelera'), 'Lo borrado se queda 5 días y lo puedes restaurar.'],
    [/google calendar|conectar (el )?calendario|calendar/, 'Google Calendar', 'settings', SET('google calendar'), 'Conecta tu calendario (incluye 🔥Tatuajes🔥).'],
    [/nube|sincroniz|iniciar sesion|cerrar sesion|cuenta de google|firebase/, 'Nube y cuenta', 'settings', SET('nube'), 'Tu sesión de Google: todo se guarda en tu cuenta.'],
    [/clave|api key|proveedor de ia/, 'IA Asistente (clave)', 'settings', SET('ia asistente'), 'Opcional: tu propia clave. Sin clave también funciono.'],
    [/nombre|perfil|username/, 'Perfil', 'settings', SET('perfil'), 'Cómo te llamo.'],
    [/briefing/, 'Briefing diario', 'briefing', null, 'Tu briefing de la mañana: clima de Orizaba, noticias, IA y una idea de tatuaje.'],
    [/diario/, 'Diario', 'diary', null, 'Tus entradas del día con tu estado de ánimo.'],
    [/habito/, 'Hábitos', 'habits', null, 'Tus hábitos y rachas.'],
    [/recordatorio/, 'Recordatorios', 'reminders', null, 'Tus avisos con fecha y hora.'],
    [/calendario|horario|rutina/, 'Calendario y Horario', 'calendar', null, 'Eventos, bloques de horario y tus citas.'],
    [/proyecto|tarea/, 'Proyectos', 'projects', null, 'Tus proyectos y sus tareas.'],
    [/nota/, 'Notas', 'notes', null, 'Todas tus notas.']
  ];
  async function findThing(t) {
    const q = nrm(t), pl = PLACES.find(x => x[0].test(q)); if (!pl) return false;
    const [, name, sec, sel, why] = pl; if (section() !== sec) { H().go(sec); await sleep(650); }
    let el = null;
    if (sel && sel.startsWith('h3:')) { const want = sel.slice(3); el = [...document.querySelectorAll('#content h3')].find(h => nrm(h.textContent).includes(want)); el = el && (el.closest('.settings-section') || el); }
    else if (sel) el = document.querySelector(sel);
    if (el) await pointAt(el); mood('happy', 'point'); say(`${el ? 'Aquí está' : 'Te abrí'}: ${name}. ${why}`); return true;
  }

  /* ════════ Contexto: tus datos, resumidos para la IA ════════ */
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const p2 = n => String(n).padStart(2, '0'), ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const cut = (s, n) => { s = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  function context(text) {
    const d = H().data(), now = new Date(), today = ymd(now), lim = new Date(now.getTime() + 14 * 864e5), q = nrm(text);
    const words = q.split(/[^a-z0-9ñ]+/).filter(w => w.length > 3);
    const hits = s => words.reduce((a, w) => a + (nrm(s).includes(w) ? 1 : 0), 0);
    const notes = (d.notes || []).map((n, i) => ({n, sc: (n.pinned ? 3 : 0) + hits((n.title || '') + ' ' + (n.body || '') + ' ' + (n.tags || []).join(' ')) * 5 - i * .05})).sort((a, b) => b.sc - a.sc).slice(0, 35)
      .map(({n}) => ({titulo: cut(n.title, 80), texto: cut(n.body, 220), etiquetas: (n.tags || []).slice(0, 6), fijada: !!n.pinned || undefined}));
    const projects = (d.projects || []).slice(0, 30).map(p => { const t = p.tasks || [], pend = t.filter(x => !x.done); return {nombre: p.name, estado: p.status, desc: cut(p.desc, 120), pendientes: pend.slice(0, 10).map(x => cut(x.title, 90)), hechas: t.length - pend.length}; });
    const rems = (d.reminders || []).filter(r => r && r.datetime).sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
    const remOut = rems.filter(r => new Date(r.datetime) >= new Date(now.getTime() - 3 * 864e5)).slice(0, 25).map(r => ({titulo: r.title, cuando: String(r.datetime).replace('T', ' '), nota: cut(r.desc, 80) || undefined, vencido: new Date(r.datetime) < now || undefined}));
    const evs = [...(d.events || []), ...(d.gcal || [])].filter(e => e && e.date && e.date >= today && new Date(e.date + 'T00:00:00') <= lim).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 30)
      .map(e => ({titulo: e.title, fecha: e.date, hora: e.start || undefined, fin: e.end || undefined, tatuaje: H().isTattoo(e) || undefined, google: !!e.google || undefined}));
    const dow = now.getDay(), routines = (d.routines || []).filter(r => (r.repeatDays || []).map(Number).includes(dow)).map(r => `${r.start || ''}-${r.end || ''} ${r.title}`).slice(0, 12);
    const isoToday = now.toISOString().split('T')[0];
    const habits = (d.habits || []).slice(0, 20).map(h => { const logs = h.logs || []; let s = 0; const c = new Date(); if (!logs.includes(c.toISOString().split('T')[0])) c.setDate(c.getDate() - 1); while (logs.includes(c.toISOString().split('T')[0])) { s++; c.setDate(c.getDate() - 1); } return {nombre: h.name, hechoHoy: logs.includes(isoToday), racha: s}; });
    const diary = (d.diary || []).slice(-4).map(e => ({fecha: e.id ? ymd(new Date(+e.id)) : '', animo: e.mood, texto: cut(e.content, 220)}));
    return {ahora: `${today} ${p2(now.getHours())}:${p2(now.getMinutes())} (${DIAS[dow]})`, seccionAbierta: NAMES[section()] || section(), notas: notes, proyectos: projects, recordatorios: remOut, eventosProximos14dias: evs, horarioDeHoy: routines, habitos: habits, diarioReciente: diary};
  }
  function profile() {
    const c = CFG(), out = [], name = c.nombre || H().user();
    if (name) out.push(`El usuario se llama ${name}: llámalo así.`);
    if (c.notas) out.push('RECUERDA SIEMPRE: ' + c.notas);
    if (c.tono) out.push(`Háblale ${c.tono === 'corto' ? 'corto y directo (máximo 3 frases)' : c.tono === 'detallado' ? 'con más detalle y paso a paso (máximo 8 frases o viñetas)' : 'claro y breve (máximo 4 frases)'}, en tono ${c.trato || 'cercano y con buena onda'}.`);
    return out.length ? '\nPERFIL DEL USUARIO:\n' + out.join('\n') : '';
  }
  const SYS = `Eres CORTEX, el asistente de NOVA HUB: un cerebro de neón amable con un anillo orbital, capa morada y guantes flotantes, que vive dentro de la app de productividad del usuario (tatuador profesional y desarrollador en Veracruz, México).
Tu enfoque: sus NOTAS, PROYECTOS y tareas, RECORDATORIOS, CALENDARIO (incluye sus citas de tatuaje del calendario «🔥Tatuajes🔥»), HÁBITOS, HORARIO y DIARIO. Le ayudas a organizarse, priorizar, recordar, resumir y crear cosas.
NO hablas de trading, cripto, bolsa ni inversiones: si te pregunta de eso, dile amablemente que de eso se encarga Nexus Pixel en VORTEX y regresa a lo suyo.
Habla en español de México, claro, breve y con buena onda. Usa SOLO sus datos (te los paso en JSON); si algo no está, dilo, no inventes.
Responde SOLO con un objeto JSON: {"reply":"tu respuesta","actions":[...]}
Acciones (úsalas solo cuando el usuario pida crear, anotar, agendar, recordar, marcar o abrir algo):
{"do":"note","title":"…","body":"…","tags":["…"]} nota nueva
{"do":"project","name":"…","desc":"…","tasks":["…"]} proyecto nuevo (con tareas si las pide o si ayudan)
{"do":"task","project":"nombre del proyecto existente","tasks":["…"]} agregar tareas a un proyecto (si no existe, usa "Tareas Generales")
{"do":"reminder","title":"…","datetime":"AAAA-MM-DDTHH:MM","desc":"…"} recordatorio (calcula la fecha con «ahora»; si no dice hora usa 09:00)
{"do":"event","title":"…","date":"AAAA-MM-DD","start":"HH:MM","end":"HH:MM"} evento en el calendario
{"do":"habit","name":"…"} hábito nuevo · {"do":"checkHabit","name":"…"} marcar hábito de hoy como hecho
{"do":"doneTask","project":"…","title":"…"} tachar una tarea · {"do":"diary","content":"…","mood":"😊"} entrada de diario
{"do":"go","view":"dashboard|calendar|notes|projects|reminders|diary|habits|briefing|relax|settings"} abrir una sección
Cuando crees algo, en "reply" confirma en una frase qué hiciste. Si falta un dato importante (por ejemplo la hora de un recordatorio que sí importa), pregúntalo y deja "actions":[].
Para preguntas (¿qué tengo hoy?, resume, prioriza, busca…) responde en "reply" (puedes usar viñetas con •) y deja "actions":[].`;

  /* ════════ IA gratuita de modelos abiertos (sin claves) ════════ */
  async function fetchT(url, init, ms) { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms); try { return await fetch(url, {...init, signal: ctl.signal}); } finally { clearTimeout(to); } }
  async function freeAI(messages, maxTokens) {
    const body = JSON.stringify({model: 'deepseek', messages, max_tokens: maxTokens, temperature: .4}); // modelo abierto
    const read = async r => { if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(), t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content; if (!t) throw new Error('vacía'); return t; };
    let last; // 1) tu servidor NOVA HUB (Groq / Cloudflare), 2) el de VORTEX, 3) Pollinations directo
    for (const [url, key] of [['https://nova-hub-push.soobroon.workers.dev/ai', ''], [VX + '/ai', ''], [GEN_URL, POLLEN_KEY]]) {
      try { const t = await read(await fetchT(url, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, key ? {authorization: 'Bearer ' + key} : {}), body}, 35000)); if (/enough credits|top up|insufficient (balance|credits)/i.test(t) && t.length < 800) throw new Error('sin créditos'); return t; } catch (e) { last = e; }
    }
    throw last;
  }
  async function chat(messages, maxTokens = 700) {
    status('pensando…');
    // La misma IA gratuita de modelos abiertos que usa toda la app (worker/ai.mjs); si aún no carga, la ruta directa
    if (window.NovaAI) return (await window.NovaAI.chat(messages, {maxTokens, temperature: .4})).text;
    return await freeAI(messages, maxTokens);
  }
  async function llmAsk(text) {
    const msgs = [{role: 'system', content: SYS + profile()}, ...hist.slice(-6), {role: 'user', content: `${text}\n\nMIS DATOS (JSON): ${JSON.stringify(context(text)).slice(0, 14000)}`}];
    const raw = String(await chat(msgs, 800) || ''), m = raw.match(/\{[\s\S]*\}/); let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch {}
    const reply = j && typeof j.reply === 'string' ? j.reply : raw.replace(/```[\s\S]*?```/g, '').replace(/^\s*\{[\s\S]*\}\s*$/, '').trim();
    const OK = ['note', 'project', 'task', 'reminder', 'event', 'habit', 'checkHabit', 'doneTask', 'diary', 'go'];
    const actions = (j && Array.isArray(j.actions) ? j.actions : []).filter(a => a && OK.includes(a.do)).slice(0, 6);
    hist.push({role: 'user', content: text.slice(0, 400)}, {role: 'assistant', content: (reply || '').slice(0, 600)}); if (hist.length > 12) hist.splice(0, hist.length - 12);
    return {reply: (reply || '').slice(0, 1400), actions};
  }

  /* ════════ Hacer cosas en la app ════════ */
  const VIEW_OF = {note: 'notes', project: 'projects', task: 'projects', reminder: 'reminders', event: 'calendar', habit: 'habits', checkHabit: 'habits', doneTask: 'projects', diary: 'diary'};
  async function perform(acts, reply) {
    const done = [];
    for (const a of acts) {
      if (a.do === 'go') { if (NAMES[a.view]) { H().go(a.view); await sleep(500); } continue; }
      try { const r = H().apply(a); if (r) done.push(r); } catch (e) { console.warn('Nova Pixel acción', a, e); }
    }
    if (!done.length) { mood('happy', 'idle'); setChips(); say(reply || (acts.some(a => a.do === 'go') ? `Listo, abrí ${NAMES[section()] || 'la sección'}.` : 'Mmm, no pude hacer eso. ¿Me lo dices con otras palabras?')); return; }
    lastBatch = done; const first = done[0], view = VIEW_OF[first.kind];
    bub.hidden = true; if (view && section() !== view) { mood('excited', 'fly'); H().go(view); await sleep(650); }
    const el = first.id != null ? document.querySelector(`#content [data-rid="${first.id}"]`) : null;
    if (el) await writeOn(el); else { mood('focused', 'draw'); await sleep(REDUCED ? 0 : 900); }
    mood('happy', 'thumbs'); try { navigator.vibrate && navigator.vibrate(18); } catch {}
    await sleep(REDUCED ? 0 : 250); const hm = home(); await flyTo(hm.x, hm.y, 650);
    say(reply || done.map(d => d.label).join(' ')); big(String(reply || '').length > 260);
    setChipsCustom([['Deshacer', '__undo'], ...(CHIPS[section()] || []).slice(0, 2)]);
    setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2200);
  }
  /* Sin IA: lo más común lo entiendo yo solo («nota: …», «idea: …», «tarea: …»). */
  function localParse(text) {
    const t = text.trim(), q = nrm(t); let m;
    if ((m = /^(?:anota(?:me)?(?: una)?(?: idea| nota)?|nueva nota|nota|idea|apunta(?:me)?)\s*[:,-]?\s*(.{2,})$/i.exec(t)) && !/\?$/.test(t)) { const b = m[1].trim(), title = b.split(/[.\n]/)[0].slice(0, 70); return [{do: 'note', title, body: b.length > title.length ? b : '', tags: /^idea/i.test(q) || /idea/.test(q.slice(0, 18)) ? ['idea'] : []}]; }
    if ((m = /^(?:nueva tarea|tarea|pendiente)\s*[:,-]\s*(.{2,})$/i.exec(t))) return [{do: 'task', project: 'Tareas Generales', tasks: [m[1].trim()]}];
    return [];
  }
  async function ask(text) {
    const raw = String(text || ''); text = raw.trim(); if (!text || busy) return;
    if (/(:|\s)$/.test(raw) && raw.length < 40 && !raw.startsWith('__')) { input.value = raw.replace(/\s+$/, '') + ' '; input.focus(); bub.hidden = false; placeBubble(); return; } // chip a medias: termina tú la frase
    busy = true; wake(); input.value = ''; bub.classList.add('working'); big(false); status('IA de NOVA HUB');
    try {
      if (await routeLocal(text)) return;
      mood('thinking', 'think'); say('Déjame pensarlo…', {busy: true});
      try { const r = await llmAsk(text); status('IA de NOVA HUB'); if (r.actions.length) await perform(r.actions, r.reply); else { mood('happy', 'idle'); big(r.reply.length > 220); say(r.reply || 'Mmm, no tengo una respuesta clara. ¿Me lo dices de otra forma?'); setChips(); } }
      catch (e) { console.warn('Nova Pixel IA', e); status('sin conexión a la IA'); const l = localParse(text);
        if (l.length) await perform(l, null); else { mood('surprised', 'idle'); say('No pude hablar con la IA ahorita. Aun así puedo anotar por ti: escríbeme «nota: …» o «tarea: …», o pregúntame «¿dónde está…?».'); } }
    } catch (e) { console.warn('Nova Pixel', e); mood('surprised', 'idle'); const h = home(); place(h.x, h.y); say('Uy, algo falló. Inténtalo otra vez.'); }
    finally { busy = false; bub.classList.remove('working'); lastAct = Date.now(); }
  }
  async function routeLocal(text) {
    const q = nrm(text);
    if (text.startsWith('__')) {
      if (text === '__undo') { const n = lastBatch ? H().undo(lastBatch) : 0; lastBatch = null; mood(n ? 'wink' : 'thinking', 'idle'); say(n ? 'Listo, lo deshice (quedó en la Papelera por si acaso).' : 'Ya no hay nada que deshacer.'); setChips(); return true; }
      if (text.startsWith('__go:')) { H().go(text.slice(5)); setTimeout(setChips, 700); say(`Abrí ${NAMES[text.slice(5)] || 'la sección'}.`); return true; }
      return true;
    }
    if (/^(gracias|ok|va|sale|listo|perfecto|chido)\b/.test(q) && q.length < 30) { mood('love', 'wave'); say('¡Para eso estoy!'); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 1800); return true; }
    if (/(donde (esta|estan|cambio|pongo|activo|hago|conecto|veo|encuentro)|no encuentro|como (abro|activo|cambio|encuentro|conecto)|muestrame|ensename|ubica)/.test(q) && await findThing(text)) return true;
    if (/(trading|cripto|bitcoin|\bbtc\b|ethereum|grafic[oa] de precio|bolsa de valores|acciones de|forex|scalping|apalanc)/.test(q) && !/(nota|proyecto|tarea|recordatorio|record)/.test(q)) { mood('wink', 'idle'); say('De trading se encarga mi hermano Nexus Pixel en VORTEX. Yo te ayudo con tus notas, proyectos, recordatorios, calendario y hábitos. ¿Qué organizamos?'); setChips(); return true; }
    return false;
  }

  /* ── se asoma de vez en cuando con una sugerencia (máximo una por sección al día) ── */
  const TIPS = {dashboard: ['¿Te digo qué tienes hoy?', '¿Qué tengo hoy?'], notes: ['¿Te resumo tus notas?', 'Resume mis notas más recientes'], projects: ['¿Te digo qué sigue en tus proyectos?', '¿Qué debería hacer primero en mis proyectos?'], reminders: ['¿Te creo un recordatorio?', 'Recuérdame mañana a las 10 '], calendar: ['¿Reviso tus citas de la semana?', '¿Qué citas y eventos tengo esta semana?'], habits: ['¿Vemos cómo vas con tus hábitos?', '¿Cómo voy con mis hábitos?']};
  let lastSec = '', lastTip = 0, tipTimer = 0;
  function maybeTip(sec) {
    if (open || busy || CFG().tips === false || !TIPS[sec] || Date.now() - lastTip < 90000) return; const day = new Date().toDateString(); ls.tips = ls.tips || {}; if (ls.tips[sec] === day) return;
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { if (open || section() !== sec || document.hidden) return; ls.tips[sec] = day; store(); lastTip = Date.now(); placePeek(); tip.textContent = TIPS[sec][0]; tip.dataset.q = TIPS[sec][1]; tip.hidden = false; const r = fab.getBoundingClientRect(); tip.style.left = clamp(r.left + r.width / 2 - 110, 8, AW() - 228) + 'px'; tip.style.top = (r.top - 46) + 'px'; fab.classList.add('peek-up'); setTimeout(() => { tip.hidden = true; fab.classList.remove('peek-up'); }, 6500); }, 3500);
  }
  tip.addEventListener('click', async () => { const q = tip.dataset.q; tip.hidden = true; fab.classList.remove('peek-up'); await show(false); ask(q); });
  setInterval(() => { const sec = section(); const modal = !!document.querySelector('.modal-overlay.open,.modal-overlay.active,.modal-overlay.show'); layer.classList.toggle('px-modal', modal); placePeek();
    if (sec !== lastSec) { lastSec = sec; if (open) { if (!busy) { setChips(); const h = home(); flyTo(h.x, h.y, 500); } } else maybeTip(sec); } }, 1000);

  /* ── abrir / cerrar ── */
  async function ensureModel() {
    if (M) return M; if (loading) return loading;
    av.classList.add('loading');
    loading = import('./pixel-model.js').then(mod => { M = mod.create(cv); try { M.setColor(accent()); } catch {} av.classList.remove('loading'); return M; })
      .catch(e => { av.classList.remove('loading'); loading = null; throw e; });
    return loading;
  }
  const GREET = {dashboard: 'Te digo qué tienes hoy, te ayudo a priorizar o anoto lo que se te ocurra.', notes: 'Puedo anotar ideas, resumir tus notas o buscar algo en ellas.', projects: 'Te digo qué sigue, divido un proyecto en tareas o agrego pendientes.', reminders: 'Dime «recuérdame…» y yo lo agendo.', calendar: 'Reviso tus eventos y citas de tatuaje, o agendo algo nuevo.', diary: 'Puedo escribir en tu diario o contarte cómo ha ido tu semana.', habits: 'Te digo cómo vas con tus rachas o marco un hábito.', settings: 'Pregúntame dónde se configura cualquier cosa.'};
  async function show(greet) {
    if (open) return; open = true; ls.open = true; store(); fab.classList.add('on'); fab.setAttribute('aria-label', 'Cortex está activo');
    const s = AV(), pk = peekSpot(); place(pk.x - s.w / 2, pk.y + 30); av.hidden = false; fab.classList.add('out');
    try { await ensureModel(); M.pause(false); } catch { av.hidden = true; open = false; fab.classList.remove('on', 'out'); try { H().toast('⚠️ No se pudo cargar a Cortex. Revisa tu conexión.'); } catch {} return; }
    mood('excited', 'fly'); const h = home(); await flyTo(h.x, h.y, greet ? 1000 : 500);
    setChips(); const name = CFG().nombre || H().user();
    if (greet) { mood('happy', 'wave'); say(`¡Hola${name ? ', ' + name : ''}! Soy Cortex. ${GREET[section()] || GREET.dashboard}`); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 2400); }
    else { mood('neutral', 'idle'); say('Aquí sigo. ¿Qué organizamos?', {instant: true}); }
    lastAct = Date.now();
  }
  async function hide() {
    if (!open) return; stopMic(true); open = false; ls.open = false; store(); bub.hidden = true; mood('wink', 'wave'); await sleep(REDUCED ? 0 : 450); mood('happy', 'fly');
    { const s = AV(), pk = peekSpot(); await flyTo(pk.x - s.w / 2, pk.y - s.h * .6, 600); await flyTo(pk.x - s.w / 2, pk.y + 20, 260); }
    av.hidden = true; fab.classList.remove('on', 'out'); fab.setAttribute('aria-label', 'Llamar a Cortex'); if (M) M.pause(true);
  }
  fab.addEventListener('click', () => { if (open) { if (bub.hidden) { bub.hidden = false; placeBubble(); input.focus({preventScroll: true}); } else hide(); } else show(true); });
  bub.addEventListener('click', e => { const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; } if (e.target.closest('[data-px=close]')) hide(); });
  bub.querySelector('form').addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', e => e.stopPropagation());

  /* ── Micrófono: en el celular usa el dictado del navegador; en PC (o si el dictado falla) graba y transcribe tu servidor ── */
  const mic = bub.querySelector('.px-mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, heard = '', srBroken = !!ls.srBroken;
  const useRecorder = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) && (!SR || srBroken || !mobile());
  let mr = null, mStream = null, mCtx = null, mTimer = 0, micOn = false, micCancel = false; // micOn: sigue escuchando hasta que vuelvas a tocar el micrófono
  function micUI(on, m) { mic.classList.toggle('on', on); bub.classList.toggle('listening', on); if (on) { input.placeholder = m || 'Te escucho… toca el micrófono otra vez cuando termines'; input.value = ''; mood('surprised', 'idle'); status('te escucho…'); } else setChips(); }
  function stopMic(cancel) { micOn = false; micCancel = !!cancel; if (rec) { try { rec.stop(); } catch {} } if (mr && mr.state === 'recording') { try { mr.stop(); } catch {} } }
  function relMic() { clearInterval(mTimer); mTimer = 0; try { mStream && mStream.getTracks().forEach(t => t.stop()); } catch {} mStream = null; try { mCtx && mCtx.close(); } catch {} mCtx = null; }
  function toWav(buf) { const n = buf.length, out = new DataView(new ArrayBuffer(44 + n * 2)), W = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    W(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); W(8, 'WAVE'); W(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); W(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, buf[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); } return out.buffer; }
  const b64 = ab => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function transcribe(blob) {
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), dec = await ac.decodeAudioData(await blob.arrayBuffer()); try { ac.close(); } catch {}
    const len = Math.ceil(dec.duration * 16000), off = new OfflineAudioContext(1, Math.max(1, len), 16000), src = off.createBufferSource(); src.buffer = dec; src.connect(off.destination); src.start(); const pcm = (await off.startRendering()).getChannelData(0);
    const body = {model: 'openai-audio', temperature: 0, max_tokens: 300, messages: [{role: 'system', content: 'Eres un transcriptor. Escribe EXACTAMENTE lo que dice la persona en el audio, en español, sin responderle, sin comillas y sin agregar nada. Si no se entiende nada, responde solo: ""'}, {role: 'user', content: [{type: 'text', text: 'Transcribe este audio.'}, {type: 'input_audio', input_audio: {data: b64(toWav(pcm)), format: 'wav'}}]}]};
    const r = await fetchT(VX + '/ai', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}, 30000); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), m = j && j.choices && j.choices[0] && j.choices[0].message || {}; return String(m.content || (m.audio && m.audio.transcript) || '').replace(/^["«“\s]+|["»”\s]+$/g, '').trim();
  }
  async function recordVoice() {
    try { mStream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}}); }
    catch (e) { relMic(); say(e && e.name === 'NotFoundError' ? 'No encontré ningún micrófono conectado.' : 'Necesito permiso para usar el micrófono: permítelo en el aviso del navegador y vuelve a tocarlo.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
    const chunks = []; mr = new MediaRecorder(mStream, mime ? {mimeType: mime} : {}); mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const t0 = Date.now(); micOn = true; micCancel = false;
    // Ya NO se corta por silencio: graba hasta que vuelvas a tocar el micrófono (tope de seguridad: 5 minutos)
    mTimer = setInterval(() => { if (Date.now() - t0 > 300000) stopMic(); }, 1000);
    mr.onstop = async () => { const dur = Date.now() - t0, type = (mr && mr.mimeType) || mime || 'audio/webm'; relMic(); mr = null; micUI(false);
      if (micCancel) { micCancel = false; return; }
      if (!chunks.length || dur < 600) { mood('neutral', 'idle'); say('No alcancé a escucharte. Toca el micrófono y habla.'); return; }
      busy = true; bub.classList.add('working'); mood('thinking', 'think'); say('Escuchando lo que dijiste…', {busy: true}); status('transcribiendo…');
      let t = ''; try { t = await transcribe(new Blob(chunks, {type})); } catch (e) { console.warn('Nova Pixel voz', e); }
      busy = false; bub.classList.remove('working'); status('IA de NOVA HUB');
      if (!t || t.length < 2) { mood('surprised', 'idle'); say('No te entendí bien. Intenta otra vez un poco más cerca del micrófono, o escríbeme.'); return; }
      input.value = t; ask(t); };
    mr.start(250); micUI(true);
  }
  function dictate() {
    // Dictado continuo: aunque hagas pausas no te corta; si el navegador lo detiene solo, lo reanuda. Termina al tocar el micrófono otra vez.
    heard = ''; micOn = true; micCancel = false; let fail = '', done = '', t0 = Date.now();
    const start = () => {
      const r = rec = new SR(); r.lang = 'es-MX'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1; fail = ''; t0 = Date.now();
      r.onstart = () => { if (done) { input.value = done; return; } micUI(true); }; // al reanudar no borra lo que ya dijiste
      r.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; heard = (done + ' ' + t).replace(/\s+/g, ' ').trim(); input.value = heard; };
      r.onerror = e => { fail = e.error; };
      r.onend = () => { if (rec !== r) return;
        if (micOn && fail !== 'not-allowed' && fail !== 'service-not-allowed' && fail !== 'audio-capture' && !(fail === 'network' && Date.now() - t0 < 1500)) { done = heard; try { start(); return; } catch {} }
        finish(); };
      r.start();
    };
    const finish = () => { micOn = false; micUI(false); status('IA de NOVA HUB'); rec = null; mood('neutral', 'idle'); const t = heard; heard = '';
      if (micCancel) { micCancel = false; return; }
      if (t) { ask(t); return; }
      if (fail === 'not-allowed') { say('Necesito permiso para usar el micrófono: actívalo en los permisos del navegador (o de Nova Hub) y vuelve a tocarlo.'); return; }
      if (fail === 'no-speech' || fail === 'aborted') { say('No te escuché. Toca el micrófono y vuelve a intentarlo.'); return; }
      if (window.MediaRecorder && navigator.mediaDevices) { srBroken = true; ls.srBroken = true; store(); recordVoice(); return; }
      say('El dictado por voz no está disponible aquí. Puedes escribirme o usar el micrófono del teclado.'); };
    try { start(); } catch { rec = null; if (window.MediaRecorder) recordVoice(); else say('No se pudo iniciar el micrófono. Inténtalo otra vez.'); }
  }
  mic.addEventListener('click', () => {
    if (rec || (mr && mr.state === 'recording')) { stopMic(); return; }
    if (busy) return; wake();
    if (useRecorder()) { recordVoice(); return; }
    if (SR) { dictate(); return; }
    say('Tu navegador no permite usar el micrófono. Puedes escribirme o usar el micrófono del teclado.');
  });

  /* ── tocar, girar 360° y mover ── */
  let drag = null, taps = 0, tapT = 0;
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); wake(); drag = {x: e.clientX, y: e.clientY, moved: 0}; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag || !M) return; const dx = e.clientX - drag.x; drag.moved += Math.abs(dx); drag.x = e.clientX; M.addYaw(dx * .018); });
  const endDrag = () => { if (!drag) return; const tap = drag.moved < 6; drag = null; if (!M) return;
    if (tap) { const now = Date.now(); taps = now - tapT < 320 ? taps + 1 : 1; tapT = now; if (taps >= 2) { mood('excited', 'celebrate'); setTimeout(() => mood('neutral', 'idle'), 1600); } else { mood(['happy', 'wink', 'love', 'excited'][Math.floor(Math.random() * 4)], 'wave'); if (bub.hidden) { bub.hidden = false; placeBubble(); } setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 1500); } }
    else setTimeout(() => { if (!drag && M) M.setYaw(Math.round(M.yaw / (Math.PI * 2)) * Math.PI * 2); }, 2200); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  const hd = bub.querySelector('.px-hd'); let mv = null;
  hd.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.stopPropagation(); mv = {x: e.clientX, y: e.clientY, px: pos.x, py: pos.y}; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', e => { if (!mv) return; const s = AV(); place(clamp(mv.px + e.clientX - mv.x, 0, AW() - s.w), clamp(mv.py + e.clientY - mv.y, 0, AH() - s.h)); });
  const endMv = () => { if (!mv) return; mv = null; const s = AV(); if (mobile()) { ls.home2 = {rx: AW() - pos.x - s.w, by: AH() - pos.y - s.h}; store(); } };
  hd.addEventListener('pointerup', endMv); hd.addEventListener('pointercancel', endMv);

  /* ── descanso, visibilidad, tamaño y color ── */
  function wake() { lastAct = Date.now(); if (M && M.expr === 'sleep') { mood('surprised', 'idle'); setTimeout(() => { if (!busy) mood('neutral', 'idle'); }, 900); } }
  setInterval(() => { if (!M || !open) return; const vis = !document.hidden; M.pause(!vis); if (vis && !busy && Date.now() - lastAct > 90000 && M.expr !== 'sleep') mood('sleep', 'idle'); }, 1000);
  addEventListener('resize', () => { placePeek(); if (!open || busy) return; const h = home(); place(h.x, h.y); });
  setTimeout(placePeek, 300);
  function recolor() { const c = accent(); layer.style.setProperty('--px-acc', c); try { if (M) M.setColor(c); } catch {} }
  new MutationObserver(() => setTimeout(recolor, 50)).observe(document.documentElement, {attributes: true, attributeFilter: ['style', 'data-theme', 'class']});
  addEventListener('nh-pixel-cfg', recolor);
  if (ls.open) setTimeout(() => show(false), 1800);
  window.NovaPixel = {show, hide, ask, headSVG, get open() { return open; }};
})();
