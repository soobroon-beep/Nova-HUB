/* ════════════════════════════════════════════════════════════════════
   NOVA HUB · Flow
   1) Tablero tipo Trello dentro de cada proyecto (Por hacer · En curso · Hecho)
   2) Bandeja de entrada: todo lo que capturas rápido cae aquí y luego lo procesas
   Usa el mismo state/save() de la app: todo se guarda en tu cuenta y se sincroniza.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const iso = () => new Date().toISOString();
  let lastId = 0;
  const nid = () => { let t = Date.now(); if (t <= lastId) t = lastId + 1; lastId = t; return t; };
  const esc = s => (typeof _esc === 'function' ? _esc(s) : String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])));
  const buzz = k => { try { haptic && haptic(k); } catch (e) {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const curView = () => document.querySelector('#sidebar .nav-item.active')?.dataset.view || 'dashboard';
  const ms = (name, cls = '') => `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${name}</span>`;
  const oneLine = s => String(s || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!Array.isArray(state.inbox)) state.inbox = [];

  /* ═══════════════════════ 1. TABLERO DEL PROYECTO ═══════════════════════ */
  const STAGES = [
    {id: 'todo', label: 'Por hacer', icon: 'radio_button_unchecked'},
    {id: 'doing', label: 'En curso', icon: 'clock_loader_40'},
    {id: 'done', label: 'Hecho', icon: 'check_circle'}
  ];
  const stageOf = t => t.done ? 'done' : (t.stage === 'doing' ? 'doing' : 'todo');
  const setStage = (t, s) => {
    t.done = s === 'done';
    if (s === 'doing') t.stage = 'doing'; else delete t.stage;
  };
  const MODE_KEY = 'nova.pd.view';
  const boardMode = () => { try { return localStorage.getItem(MODE_KEY) === 'board'; } catch (e) { return false; } };
  const setBoardMode = on => { try { localStorage.setItem(MODE_KEY, on ? 'board' : 'list'); } catch (e) {} };

  const touchProject = p => { p.updatedAt = iso(); save(); try { refreshProjectsBehind(); } catch (e) {} };
  const refreshProgress = (box, p) => { const m = box.querySelector('#pdProg'); if (m && typeof pdProgressHTML === 'function') m.innerHTML = pdProgressHTML(p); };

  function decorateDetail(box, p) {
    if (!box || !p) return;
    const body = box.querySelector('.pd-body'); if (!body) return;
    const board = boardMode();
    box.classList.toggle('pd-board', board);

    const sw = document.createElement('div');
    sw.className = 'pd-viewsw'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Vista de tareas');
    sw.innerHTML = `<button type="button" data-v="list" aria-pressed="${!board}">${ms('format_list_bulleted')}Lista</button>` +
      `<button type="button" data-v="board" aria-pressed="${board}">${ms('view_kanban')}Tablero</button>`;
    body.prepend(sw);
    sw.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const want = b.dataset.v === 'board'; if (want === boardMode()) return;
      setBoardMode(want); buzz('select');
      renderProjectDetail();
    });

    if (!board) {   // Lista: marca las tareas «En curso»
      box.querySelectorAll('#pdTasks .pd-task').forEach(row => {
        const i = Number(row.querySelector('.pd-check')?.dataset.idx); const t = p.tasks?.[i];
        if (t && stageOf(t) === 'doing' && !row.querySelector('.pd-stage')) row.querySelector('.pd-text')?.insertAdjacentHTML('afterend', '<span class="pd-stage">En curso</span>');
      });
      return;
    }
    box.querySelector('#pdTasks')?.setAttribute('hidden', '');
    box.querySelector('.pd-add')?.setAttribute('hidden', '');
    const wrap = document.createElement('div');
    wrap.className = 'kb'; wrap.id = 'pdBoard';
    body.appendChild(wrap);
    renderBoard(box, p);
    bindDrag(box, wrap, p);
  }

  function renderBoard(box, p) {
    const wrap = box.querySelector('#pdBoard'); if (!wrap) return;
    const keepScroll = wrap.scrollLeft;
    const tasks = p.tasks || [];
    wrap.innerHTML = STAGES.map(s => {
      const items = tasks.map((t, i) => [t, i]).filter(([t]) => stageOf(t) === s.id);
      return `<section class="kb-col" data-stage="${s.id}" aria-label="${s.label}">
        <header class="kb-col-h">${ms(s.icon, 'kb-col-i')}<b>${s.label}</b><span class="kb-n">${items.length}</span></header>
        <div class="kb-cards" data-stage="${s.id}">${items.map(([t, i]) => cardHTML(t, i)).join('') || ''}</div>
        <div class="kb-add"><textarea rows="1" data-stage="${s.id}" placeholder="+ Añadir tarjeta" enterkeyhint="send" aria-label="Nueva tarjeta en ${s.label}"></textarea></div>
      </section>`;
    }).join('');
    wrap.scrollLeft = keepScroll;
    refreshProgress(box, p);

    wrap.querySelectorAll('.kb-add textarea').forEach(ta => {
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
      ta.addEventListener('input', grow);
      ta.addEventListener('keydown', e => {
        if (e.key === 'Escape') { ta.value = ''; grow(); ta.blur(); return; }
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        const title = oneLine(ta.value); if (!title) return;
        const t = {title, done: false}; setStage(t, ta.dataset.stage);
        p.tasks = p.tasks || []; p.tasks.push(t); touchProject(p);
        if (t.done) { try { addXP(10); } catch (x) {} }
        const st = ta.dataset.stage; renderBoard(box, p); buzz('tap');
        const again = box.querySelector(`#pdBoard .kb-add textarea[data-stage="${st}"]`); again && again.focus();
        box.querySelector(`#pdBoard .kb-cards[data-stage="${st}"] .kb-card:last-child`)?.classList.add('kb-new');
      });
    });

    wrap.querySelectorAll('.kb-card').forEach(card => {
      const i = Number(card.dataset.idx);
      card.querySelector('.kb-check').addEventListener('click', e => {
        e.stopPropagation();
        const t = p.tasks[i]; if (!t) return;
        const wasDone = t.done; setStage(t, wasDone ? 'todo' : 'done'); touchProject(p);
        if (!wasDone) { try { addXP(10); celebrateIfProjectDone(p); } catch (x) {} }
        renderBoard(box, p);
      });
      card.querySelector('.kb-more').addEventListener('click', e => { e.stopPropagation(); openCardMenu(box, p, card, i); });
      card.addEventListener('dblclick', e => { if (!e.target.closest('button')) editCard(box, p, card, i); });
      card.addEventListener('keydown', e => {
        if (e.target !== card) return;
        if (e.key === 'Enter') { e.preventDefault(); editCard(box, p, card, i); }
        const order = STAGES.map(s => s.id), cur = order.indexOf(stageOf(p.tasks[i]));
        const go = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : -9;
        if (go >= 0 && go < order.length) { e.preventDefault(); moveTo(box, p, i, order[go]); focusTask(box, p.tasks.length - 1); }
      });
    });
  }
  const focusTask = (box, i) => { if (i == null) return; box.querySelector(`#pdBoard .kb-card[data-idx="${i}"]`)?.focus(); };

  const cardHTML = (t, i) => `<div class="kb-card${t.done ? ' done' : ''}" data-idx="${i}" tabindex="0" aria-label="${esc(t.title)}">
      <button type="button" class="kb-check" aria-label="${t.done ? 'Reabrir' : 'Marcar como hecha'}">${ms(t.done ? 'check_circle' : 'radio_button_unchecked')}</button>
      <span class="kb-text">${esc(t.title)}</span>
      <button type="button" class="kb-more" aria-label="Opciones de la tarjeta">${ms('more_horiz')}</button>
    </div>`;

  function moveTo(box, p, i, stage) {
    const t = p.tasks[i]; if (!t) return;
    const was = stageOf(t); if (was === stage) return;
    setStage(t, stage);
    // Pasa al final de la columna destino
    p.tasks.splice(i, 1); p.tasks.push(t);
    touchProject(p);
    if (stage === 'done') { try { addXP(10); celebrateIfProjectDone(p); } catch (x) {} }
    renderBoard(box, p); buzz('select');
  }

  function editCard(box, p, card, i) {
    const sp = card.querySelector('.kb-text'); const t = p.tasks[i]; if (!sp || !t) return;
    card.classList.add('editing');
    sp.contentEditable = 'true'; sp.spellcheck = false; sp.focus();
    try { const r = document.createRange(); r.selectNodeContents(sp); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    const done = commit => {
      sp.removeEventListener('blur', onBlur); sp.removeEventListener('keydown', onKey);
      sp.contentEditable = 'false'; card.classList.remove('editing');
      const val = oneLine(sp.textContent);
      if (commit && val && val !== t.title) { t.title = val; touchProject(p); }
      sp.textContent = t.title;
    };
    const onBlur = () => done(true);
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); sp.blur(); } else if (e.key === 'Escape') { e.preventDefault(); sp.textContent = t.title; done(false); card.focus(); } };
    sp.addEventListener('blur', onBlur); sp.addEventListener('keydown', onKey);
  }

  function deleteCard(box, p, i) {
    const t = p.tasks[i]; if (!t) return;
    if (!confirm('¿Eliminar esta tarea?')) return;
    try { addToTrash('task', t, {projectId: p.id, idx: i}); } catch (e) {}
    p.tasks.splice(i, 1); touchProject(p); renderBoard(box, p);
    toast('🗑️ Movido a la papelera');
  }

  let menuEl = null;
  const closeMenu = () => { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', outside, true); } };
  const outside = e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  function openCardMenu(box, p, card, i) {
    closeMenu();
    const t = p.tasks[i]; if (!t) return;
    const cur = stageOf(t);
    menuEl = document.createElement('div');
    menuEl.className = 'kb-menu'; menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = `<small>Mover a</small>` +
      STAGES.map(s => `<button type="button" role="menuitem" data-go="${s.id}" ${s.id === cur ? 'aria-current="true"' : ''}>${ms(s.icon)}${s.label}</button>`).join('') +
      `<hr><button type="button" role="menuitem" data-act="edit">${ms('edit')}Editar texto</button>` +
      `<button type="button" role="menuitem" data-act="del" class="kb-danger">${ms('delete')}Eliminar</button>`;
    document.body.appendChild(menuEl);
    const r = card.querySelector('.kb-more').getBoundingClientRect(), mw = 200, mh = menuEl.offsetHeight;
    let x = Math.min(r.right - mw, innerWidth - mw - 8); x = Math.max(8, x);
    let y = r.bottom + 6; if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
    menuEl.style.left = x + 'px'; menuEl.style.top = y + 'px';
    menuEl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      closeMenu();
      if (b.dataset.go) moveTo(box, p, i, b.dataset.go);
      else if (b.dataset.act === 'edit') { const c = box.querySelector(`#pdBoard .kb-card[data-idx="${i}"]`); c && editCard(box, p, c, i); }
      else if (b.dataset.act === 'del') deleteCard(box, p, i);
    });
    menuEl.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); card.focus(); } });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    menuEl.querySelector('button')?.focus({preventScroll: true});
  }
  addEventListener('resize', closeMenu);

  /* ── Arrastrar y soltar (mouse: arrastra directo · táctil: mantén presionado y arrastra) ── */
  function bindDrag(box, wrap, p) {
    const scroller = box.querySelector('.pd-body');
    let pend = null, drag = null, raf = 0, lastXY = [0, 0];
    const cancelPend = () => { if (pend) { clearTimeout(pend.timer); pend.card.classList.remove('kb-press'); pend = null; } };

    const start = (card, x, y) => {
      cancelPend(); closeMenu();
      const r = card.getBoundingClientRect();
      const ghost = card.cloneNode(true);
      ghost.classList.add('kb-ghost'); ghost.removeAttribute('tabindex');
      Object.assign(ghost.style, {width: r.width + 'px', left: r.left + 'px', top: r.top + 'px'});
      document.body.appendChild(ghost);
      card.classList.add('kb-src');
      drag = {card, ghost, dx: x - r.left, dy: y - r.top, idx: Number(card.dataset.idx)};
      document.body.classList.add('kb-dragging');
      buzz('select'); try { navigator.vibrate && navigator.vibrate(12); } catch (e) {}
      move(x, y); loop();
    };
    const move = (x, y) => {
      if (!drag) return; lastXY = [x, y];
      drag.ghost.style.transform = `translate(${x - drag.dx - parseFloat(drag.ghost.style.left)}px,${y - drag.dy - parseFloat(drag.ghost.style.top)}px) rotate(2.5deg)`;
      const under = document.elementFromPoint(x, y);
      const col = under?.closest?.('#pdBoard .kb-col'); if (!col) return;
      const list = col.querySelector('.kb-cards');
      wrap.querySelectorAll('.kb-col').forEach(c => c.classList.toggle('kb-over', c === col));
      const after = [...list.querySelectorAll('.kb-card:not(.kb-src)')].find(c => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; });
      if (after) { if (drag.card.nextElementSibling !== after) list.insertBefore(drag.card, after); }
      else if (list.lastElementChild !== drag.card) list.appendChild(drag.card);
    };
    const loop = () => {   // desplazamiento automático cerca de los bordes
      cancelAnimationFrame(raf);
      const step = () => {
        if (!drag) return;
        const [x, y] = lastXY, br = wrap.getBoundingClientRect(), sr = scroller.getBoundingClientRect(), E = 48;
        let moved = false;
        if (wrap.scrollWidth > wrap.clientWidth) {
          if (x < br.left + E) { wrap.scrollLeft -= 14; moved = true; } else if (x > br.right - E) { wrap.scrollLeft += 14; moved = true; }
        }
        if (y < sr.top + E) { scroller.scrollTop -= 12; moved = true; } else if (y > sr.bottom - E) { scroller.scrollTop += 12; moved = true; }
        if (moved) move(x, y);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const finish = () => {
      cancelPend();
      if (!drag) return;
      cancelAnimationFrame(raf);
      const {card, ghost, idx} = drag; drag = null;
      document.body.classList.remove('kb-dragging');
      wrap.querySelectorAll('.kb-over').forEach(c => c.classList.remove('kb-over'));
      const t = p.tasks[idx];
      const list = card.parentElement, stage = list?.dataset.stage;
      const next = card.nextElementSibling ? p.tasks[Number(card.nextElementSibling.dataset.idx)] : null;
      const prev = card.previousElementSibling ? p.tasks[Number(card.previousElementSibling.dataset.idx)] : null;
      const land = card.getBoundingClientRect();
      ghost.animate ? ghost.animate([{transform: ghost.style.transform, opacity: 1}, {transform: `translate(${land.left - parseFloat(ghost.style.left)}px,${land.top - parseFloat(ghost.style.top)}px)`, opacity: .6}], {duration: reduced.matches ? 0 : 140, easing: 'ease-out'}).finished.finally(() => ghost.remove()) : ghost.remove();
      if (!t || !stage) { renderBoard(box, p); return; }
      const wasStage = stageOf(t), oldPos = idx;
      p.tasks.splice(idx, 1);
      let pos = next ? p.tasks.indexOf(next) : (prev ? p.tasks.indexOf(prev) + 1 : p.tasks.length);
      if (pos < 0) pos = p.tasks.length;
      p.tasks.splice(pos, 0, t);
      setStage(t, stage);
      const changed = wasStage !== stage || pos !== oldPos;
      if (changed) {
        touchProject(p);
        if (stage === 'done' && wasStage !== 'done') { try { addXP(10); celebrateIfProjectDone(p); } catch (x) {} }
      }
      _suppressClick = true; setTimeout(() => { _suppressClick = false; }, 60);
      renderBoard(box, p);
    };
    let _suppressClick = false;
    wrap.addEventListener('click', e => { if (_suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);

    // Mouse
    wrap.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const card = e.target.closest('.kb-card'); if (!card || card.classList.contains('editing') || e.target.closest('button,textarea,[contenteditable="true"]')) return;
      pend = {card, x: e.clientX, y: e.clientY, mouse: true, timer: 0};
    });
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (drag) { e.preventDefault(); move(e.clientX, e.clientY); return; }
      if (pend && pend.mouse && Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 5) start(pend.card, e.clientX, e.clientY);
    });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') finish(); });

    // Táctil: mantener presionado ~0.3 s para levantar la tarjeta; si deslizas antes, haces scroll normal
    wrap.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) { cancelPend(); return; }
      const card = e.target.closest('.kb-card'); if (!card || card.classList.contains('editing') || e.target.closest('textarea,[contenteditable="true"]')) return;
      const tt = e.touches[0];
      pend = {card, x: tt.clientX, y: tt.clientY, timer: setTimeout(() => { if (pend) start(pend.card, pend.x, pend.y); }, 300)};
      card.classList.add('kb-press');
    }, {passive: true});
    wrap.addEventListener('touchmove', e => {
      const tt = e.touches[0]; if (!tt) return;
      if (drag) { e.preventDefault(); move(tt.clientX, tt.clientY); return; }
      if (pend && Math.hypot(tt.clientX - pend.x, tt.clientY - pend.y) > 8) cancelPend();
    }, {passive: false});
    wrap.addEventListener('touchend', finish);
    wrap.addEventListener('touchcancel', finish);
    wrap.addEventListener('contextmenu', e => { if (e.target.closest('.kb-card')) e.preventDefault(); });
  }

  /* ═══════════════════════ 2. BANDEJA DE ENTRADA ═══════════════════════ */
  const SRC = {
    cortex: {icon: 'graphic_eq', label: 'Cortex'},
    share: {icon: 'ios_share', label: 'Compartido'},
    inbox: {icon: 'edit_note', label: 'Escrito aquí'},
    voice: {icon: 'mic', label: 'Dictado'}
  };
  const ago = d => {
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'ahora';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const days = Math.round(s / 86400);
    if (days < 7) return days === 1 ? 'ayer' : `hace ${days} días`;
    return new Date(d).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'});
  };
  const pending = () => (state.inbox || []).length;

  function capture(text, source = 'inbox') {
    const t = String(text || '').trim(); if (!t) return null;
    const item = {id: nid(), text: t.slice(0, 4000), source: SRC[source] ? source : 'inbox', createdAt: iso()};
    state.inbox = state.inbox || [];
    state.inbox.unshift(item);
    save(); updateBadge();
    if (curView() === 'inbox') renderInboxList(item.id);
    return item;
  }

  const splitTitle = text => {
    const t = String(text || '').trim();
    const first = t.split(/\n|(?<=[.!?])\s/)[0].trim();
    const title = (first.length > 80 ? first.slice(0, 77).trimEnd() + '…' : first) || 'Sin título';
    return {title, rest: t.length > first.length ? t : ''};
  };
  const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`; };

  function removeItem(id) { state.inbox = (state.inbox || []).filter(x => x.id !== id); }
  function convert(id, kind, opt = {}) {
    const it = (state.inbox || []).find(x => x.id === id); if (!it) return false;
    const {title, rest} = splitTitle(it.text);
    let msg = '';
    if (kind === 'note') {
      state.notes.unshift({id: nid(), title, body: rest, tags: [], color: '#7c6af7', pinned: false, createdAt: iso()});
      msg = '📝 Guardado como nota';
    } else if (kind === 'task') {
      let p = state.projects.find(x => String(x.id) === String(opt.projectId));
      if (!p) {
        p = state.projects.find(x => x.name === 'Tareas Generales');
        if (!p) { p = {id: nid(), name: 'Tareas Generales', desc: 'Tareas rápidas sin proyecto asignado', status: 'active', color: '#7c6af7', icon: 'checklist', pinned: false, tasks: [], createdAt: iso()}; state.projects.unshift(p); }
      }
      p.tasks = p.tasks || []; p.tasks.push({title: oneLine(it.text).slice(0, 300), done: false}); p.updatedAt = iso();
      msg = `✅ Tarea agregada a «${p.name}»`;
    } else if (kind === 'project') {
      state.projects.unshift({id: nid(), name: title, desc: rest ? rest.slice(0, 600) : '', status: 'active', color: '#7c6af7', icon: 'rocket_launch', motion: 'glow', pinned: false, tasks: [], createdAt: iso()});
      msg = '🚀 Proyecto creado';
    } else if (kind === 'reminder') {
      const dt = String(opt.datetime || '').slice(0, 16);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) { toast('⚠️ Elige fecha y hora'); return false; }
      state.reminders.push({id: nid(), title, desc: rest ? rest.slice(0, 600) : '', datetime: dt, color: '#7c6af7', tags: [], notified: false});
      msg = '⏰ Recordatorio guardado';
    } else if (kind === 'delete') {
      try { addToTrash('inbox', it); } catch (e) {}
      msg = '🗑️ Movido a la papelera';
    } else return false;
    removeItem(id); save(); updateBadge();
    try { updateStats(); } catch (e) {}
    toast(msg); buzz(kind === 'delete' ? 'tap' : 'success');
    return true;
  }

  function updateBadge() {
    const n = pending(), txt = n > 99 ? '99+' : String(n);
    const nav = document.querySelector('#sidebar .nav-item[data-view="inbox"]');
    if (nav) { if (n) nav.dataset.count = txt; else delete nav.dataset.count; }
    const dock = document.querySelector('#novaFloatingDock .nova-dock-item[data-dock="inbox"]');
    if (dock) {
      let b = dock.querySelector('.ib-badge');
      if (n) { if (!b) { b = document.createElement('span'); b.className = 'ib-badge'; dock.appendChild(b); } b.textContent = txt; }
      else b && b.remove();
    }
    const top = document.getElementById('inboxTopBtn');
    if (top) {
      const b = top.querySelector('.ib-badge');
      b.textContent = txt; b.hidden = !n;
      top.setAttribute('aria-label', n ? `Bandeja de entrada: ${n} por procesar` : 'Bandeja de entrada');
    }
  }

  function renderInboxView() {
    const content = document.getElementById('content');
    content.style.padding = '28px';
    content.innerHTML = `
      <div class="ib-wrap">
        <div class="ib-head">
          <div>
            <h1 class="ib-title">Bandeja de entrada</h1>
            <p class="ib-sub" id="inboxSub"></p>
          </div>
          <button class="btn btn-primary" id="inboxNewBtn" type="button">+ Capturar</button>
        </div>
        <form class="ib-capture" id="inboxForm" autocomplete="off">
          ${ms('add_circle', 'ib-cap-i')}
          <textarea id="inboxInput" rows="1" placeholder="¿Qué tienes en mente?" enterkeyhint="send" aria-label="Capturar en la bandeja"></textarea>
          <button type="button" class="ib-mic" id="inboxMic" aria-label="Dictar">${ms('mic')}</button>
          <button type="submit" class="btn btn-primary ib-save" id="inboxAdd">Guardar</button>
        </form>
        <div id="inboxList" class="ib-list" aria-live="polite"></div>
      </div>`;
    const input = $('#inboxInput'), form = $('#inboxForm');
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const it = capture(input.value, input.dataset.src || 'inbox'); if (!it) { input.focus(); return; }
      input.value = ''; delete input.dataset.src; grow(); input.focus(); buzz('tap');
    });
    $('#inboxNewBtn').addEventListener('click', () => { input.focus(); input.scrollIntoView({block: 'nearest', behavior: 'smooth'}); });
    bindMic($('#inboxMic'), input, grow);
    renderInboxList();
  }

  const inboxSig = () => (state.inbox || []).map(x => x.id + ':' + (x.updatedAt || '')).join(',');
  let lastSig = '';
  function renderInboxList(newId) {
    const list = $('#inboxList'); if (!list) return;
    lastSig = inboxSig();
    const items = state.inbox || [], n = items.length;
    const sub = $('#inboxSub');
    if (sub) sub.textContent = n ? `${n} por procesar · conviértelo en nota, tarea, proyecto o recordatorio` : 'Todo lo que capturas rápido llega aquí';
    if (!n) {
      list.innerHTML = `<div class="ib-empty">${ms('inbox', 'ib-empty-i')}<b>Bandeja vacía</b><span>Todo procesado. Lo que dictes o escribas con Cortex, o compartas desde otra app, aparecerá aquí.</span></div>`;
      return;
    }
    const projOpts = () => {
      const ps = (state.projects || []).filter(p => p.status !== 'done' && p.status !== 'archived');
      const hasGen = ps.some(p => p.name === 'Tareas Generales');
      return (hasGen ? '' : '<option value="__general__">Tareas Generales</option>') + ps.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    };
    list.innerHTML = items.map(it => {
      const s = SRC[it.source] || SRC.inbox;
      return `<article class="ib-item${it.id === newId ? ' ib-new' : ''}" data-id="${it.id}">
        <div class="ib-row">
          <span class="ib-src" title="${s.label}">${ms(s.icon)}</span>
          <div class="ib-body">
            <div class="ib-text" tabindex="0" title="Toca para editar">${esc(it.text)}</div>
            <div class="ib-meta">${ago(it.createdAt)} · ${s.label}</div>
          </div>
          <button type="button" class="ib-x" data-act="delete" aria-label="Eliminar">${ms('close')}</button>
        </div>
        <div class="ib-actions">
          <button type="button" data-act="note">${ms('sticky_note_2')}Nota</button>
          <button type="button" data-act="task">${ms('checklist')}Tarea</button>
          <button type="button" data-act="project">${ms('rocket_launch')}Proyecto</button>
          <button type="button" data-act="reminder">${ms('alarm')}Recordatorio</button>
        </div>
        <div class="ib-pick" hidden></div>
      </article>`;
    }).join('');

    list.querySelectorAll('.ib-item').forEach(el => {
      const id = Number(el.dataset.id), pick = el.querySelector('.ib-pick');
      const done = kind => {
        const ok = convert(id, kind, el._opt || {}); if (!ok) return;
        const fin = () => renderInboxList();
        if (reduced.matches || !el.animate) return fin();
        const h = el.offsetHeight;
        el.animate([{opacity: 1, transform: 'none', height: h + 'px'}, {opacity: 0, transform: `translateX(${kind === 'delete' ? '-' : ''}24px)`, height: h + 'px', offset: .55}, {opacity: 0, height: '0px', marginBottom: '-10px', paddingTop: 0, paddingBottom: 0}], {duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)'}).finished.then(fin, fin);
      };
      el.addEventListener('click', e => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const act = b.dataset.act;
        el.querySelectorAll('.ib-actions button').forEach(x => x.classList.toggle('on', x === b && (act === 'task' || act === 'reminder') && pick.hidden));
        if (act === 'task') {
          if (!pick.hidden && pick.dataset.kind === 'task') { pick.hidden = true; return; }
          pick.dataset.kind = 'task'; pick.hidden = false;
          pick.innerHTML = `<label>${ms('folder')}<select aria-label="Proyecto">${projOpts()}</select></label><button type="button" class="btn btn-primary" data-ok>Agregar tarea</button>`;
          pick.querySelector('[data-ok]').addEventListener('click', () => { el._opt = {projectId: pick.querySelector('select').value}; done('task'); });
          pick.querySelector('select').focus();
        } else if (act === 'reminder') {
          if (!pick.hidden && pick.dataset.kind === 'reminder') { pick.hidden = true; return; }
          pick.dataset.kind = 'reminder'; pick.hidden = false;
          pick.innerHTML = `<label>${ms('event')}<input type="datetime-local" value="${tomorrow9()}" aria-label="Fecha y hora"></label><button type="button" class="btn btn-primary" data-ok>Guardar recordatorio</button>`;
          pick.querySelector('[data-ok]').addEventListener('click', () => { el._opt = {datetime: pick.querySelector('input').value}; done('reminder'); });
        } else done(act);
      });
      // Editar el texto capturado con un toque
      const tx = el.querySelector('.ib-text');
      const edit = () => {
        if (tx.isContentEditable) return;
        tx.contentEditable = 'true'; tx.focus(); el.classList.add('editing');
        const it = state.inbox.find(x => x.id === id);
        const end = commit => {
          tx.contentEditable = 'false'; el.classList.remove('editing');
          const v = tx.innerText.trim();
          if (commit && it && v && v !== it.text) { it.text = v.slice(0, 4000); it.updatedAt = iso(); save(); }
          tx.textContent = it ? it.text : v;
        };
        tx.addEventListener('blur', () => end(true), {once: true});
        tx.onkeydown = e => { if (e.key === 'Escape') { tx.textContent = it?.text || ''; tx.blur(); } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); tx.blur(); } };
      };
      tx.addEventListener('click', edit);
      tx.addEventListener('keydown', e => { if (e.key === 'Enter' && !tx.isContentEditable) { e.preventDefault(); edit(); } });
    });
  }

  function bindMic(btn, input, grow) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.hidden = true; return; }
    let rec = null;
    btn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'es-MX'; rec.interimResults = true; rec.continuous = false;
      const base = input.value ? input.value.trimEnd() + ' ' : '';
      rec.onresult = e => { input.value = base + [...e.results].map(r => r[0].transcript).join(' '); input.dataset.src = 'voice'; grow(); };
      rec.onend = () => { rec = null; btn.classList.remove('rec'); input.focus(); };
      rec.onerror = () => { rec = null; btn.classList.remove('rec'); };
      btn.classList.add('rec'); buzz('select');
      try { rec.start(); } catch (e) { rec = null; btn.classList.remove('rec'); }
    });
  }

  /* Botón de bandeja en la barra superior (celular) */
  (function topButton() {
    const right = document.querySelector('#topbar .topbar-right'); if (!right || document.getElementById('inboxTopBtn')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'inboxTopBtn'; b.className = 'ib-top';
    b.innerHTML = `${ms('inbox')}<span class="ib-badge" hidden></span>`;
    b.addEventListener('click', () => { buzz('tap'); document.querySelector('#sidebar .nav-item[data-view="inbox"]')?.click(); });
    const av = document.getElementById('avatarEl');
    av && av.parentElement === right ? right.insertBefore(b, av) : right.appendChild(b);
  })();

  // Si llegan cambios de otro dispositivo, el contador y la vista se actualizan
  setInterval(() => {
    const sig = inboxSig();
    if (sig === lastSig) return; lastSig = sig; updateBadge();
    if (curView() === 'inbox' && !document.querySelector('#inboxList .editing, #inboxList .ib-pick:not([hidden])') && document.activeElement?.id !== 'inboxInput') renderInboxList();
  }, 1500);
  setTimeout(updateBadge, 0);

  window.renderInboxView = renderInboxView;
  window.NovaFlow = {capture, convert, decorateDetail, renderBoard, updateBadge, pending};
})();
