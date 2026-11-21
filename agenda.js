// Agenda comparte los datos y los editores del calendario principal.
const NovaAgenda = (() => {
  const format = options => new Intl.DateTimeFormat('es-MX', options);
  const month = format({month:'long', year:'numeric'});
  const weekday = format({weekday:'long'});
  const shortDay = format({weekday:'short'});
  const fullDate = format({weekday:'long', day:'numeric', month:'long', year:'numeric'});
  let selected = null;

  function element(tag, cls, label) {
    const el = document.createElement(tag);
    el.className = cls;
    if (label !== undefined) el.textContent = label;
    return el;
  }
  function button(cls, label, action, title) {
    const el = element('button', cls, label);
    el.type = 'button';
    el.addEventListener('click', action);
    if (title) { el.title = title; el.setAttribute('aria-label', title); }
    return el;
  }
  function current() {
    const date = selected ? new Date(selected + 'T12:00:00') : new Date();
    date.setHours(12, 0, 0, 0);
    return date;
  }
  function shift(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  function choose(date) {
    selected = date ? localDateStr(date) : null;
    refreshDay();
  }
  function entries(date) {
    const blocks = (state.routines || []).filter(b => blockRepeatsToday(b, date.getDay()))
      .map(b => ({title:b.title, start:b.start, end:b.end, source:'Horario', color:b.color}));
    const events = gcal.forDate(localDateStr(date)).map(e => ({
      title:e.title, start:e.start, end:e.end, source:e.google ? 'Google Calendar' : 'Calendario', color:e.color
    }));
    return events.concat(blocks).sort((a,b) => (a.start || '').localeCompare(b.start || ''));
  }
  function refreshDay() {
    const mast = document.getElementById('agendaMast');
    if (!mast) return;
    const date = current();
    mast.querySelector('.ag-month').textContent = month.format(date);
    mast.querySelector('.ag-numeral').textContent = date.getDate();
    mast.querySelector('.ag-weekday').textContent = weekday.format(date);
    const schedule = document.getElementById('agendaSchedule');
    if (!schedule) return;
    const monday = shift(date, -((date.getDay() + 6) % 7));
    const today = localDateStr(new Date());
    const chosen = localDateStr(date);
    mast.querySelectorAll('.ag-day').forEach((btn, i) => {
      const day = shift(monday, i);
      const key = localDateStr(day);
      btn.dataset.date = key;
      btn.children[0].textContent = shortDay.format(day).replace('.', '');
      btn.children[1].textContent = day.getDate();
      btn.setAttribute('aria-label', fullDate.format(day));
      btn.setAttribute('aria-pressed', String(key === chosen));
      if (key === today) btn.setAttribute('aria-current','date');
      else btn.removeAttribute('aria-current');
    });
    const rows = entries(date);
    const list = schedule.querySelector('.ag-entries');
    const fragment = document.createDocumentFragment();
    schedule.querySelector('h2').textContent = chosen === today ? 'Agenda de hoy' : 'Agenda del ' + formatDay(date);
    for (const entry of rows) {
      const row = element('li','ag-entry');
      const clock = element('span','ag-clock',entry.start || 'Todo el día');
      if (entry.start && entry.end) clock.append(element('small','',entry.end));
      const info = element('div','ag-entry-info');
      if (entry.color && CSS.supports('color',entry.color)) info.style.setProperty('--entry-color', entry.color);
      info.append(element('strong','',entry.title),element('small','',entry.source));
      row.append(clock,info);
      fragment.append(row);
    }
    if (!rows.length) fragment.append(element('li','ag-empty','Sin eventos ni horarios para este día.'));
    list.replaceChildren(fragment);
  }
  const dayMonth = format({day:'numeric', month:'long'});
  const formatDay = date => dayMonth.format(date);
  function masthead(withWeek) {
    const mast = element('header','ag-mast');
    mast.id = 'agendaMast';
    const date = element('div','ag-date');
    const text = element('div','ag-date-text');
    text.append(element('span','ag-month'),element('h1','ag-weekday'));
    date.append(element('span','ag-numeral'),text);
    mast.append(date);
    if (withWeek) {
      const calendar = element('div','ag-picker');
      const toolbar = element('div','ag-toolbar');
      const controls = element('div','ag-controls');
      controls.append(button('','‹',() => choose(shift(current(), -7)),'Semana anterior'),
        button('ag-today','Hoy',() => choose(null),'Ir a hoy'),
        button('','›',() => choose(shift(current(), 7)),'Semana siguiente'));
      toolbar.append(element('span','ag-caption','Semana'),controls);
      const week = element('div','ag-week');
      week.setAttribute('role','group'); week.setAttribute('aria-label','Días de la semana');
      for (let i = 0; i < 7; i++) {
        const day = button('ag-day','',() => choose(new Date(day.dataset.date + 'T12:00:00')));
        day.append(element('span',''),element('strong',''));
        week.append(day);
      }
      calendar.append(toolbar, week); mast.append(calendar);
    }
    return mast;
  }
  function schedulePanel() {
    const box = element('section','ag-schedule');
    box.id = 'agendaSchedule';
    const header = element('div','ag-section-head');
    const title = element('h2','');
    title.setAttribute('aria-live','polite');
    header.append(title, button('ag-add','+ Evento',() => _openNewEventOn(localDateStr(current()))));
    box.append(header,element('ol','ag-entries'));
    return box;
  }
  function organize(content) {
    const nativeCalendar = content.querySelector('.cal-card');
    const mast = masthead(Boolean(nativeCalendar));
    const layout = element('div','ag-layout');
    const primary = element('div','ag-primary');
    const side = element('aside','ag-side');
    side.setAttribute('aria-label','Avance y recordatorios');
    function move(selector, parent, wrapper = false) {
      const node = content.querySelector(selector);
      if (node) parent.append(wrapper ? node.parentElement : node);
    }
    function report(selector, id) {
      if (!content.querySelector(selector)) return;
      const panel = element('section','studio-report');
      panel.id = id;
      side.append(panel);
    }
    function fold(title, widgets, parent) {
      const section = element('details','ag-fold');
      section.append(element('summary','',title));
      const body = element('div','ag-fold-body');
      for (const [selector,wrapper] of widgets) move(selector,body,wrapper);
      if (body.childElementCount) { section.append(body); parent.append(section); }
    }
    if (nativeCalendar) primary.append(schedulePanel());
    report('#projectsList','studioProjects');
    report('#dashHabits','studioWeek');
    move('#dashReminders',side);
    move('#focusCard',primary);
    fold('Calendario mensual',[['.cal-card']],primary);
    move('.notes-section',primary);
    fold('Proyectos y hábitos',[['#projectsList',true],['#dashHabits']],side);
    fold('Resumen y actividad',[['#dailyBriefingCard'],['#daySummaryCard'],['.stats-row'],['#ringsCard'],['#dashActivityList',true]],primary);
    fold('Diario emocional',[['#dashDiary']],primary);
    content.querySelector('.dash-grid')?.remove();
    if (primary.childElementCount || side.childElementCount) {
      content.querySelector(':scope > div[style*="text-align:center"]')?.remove();
    }
    if (primary.childElementCount) layout.append(primary);
    if (side.childElementCount) layout.append(side);
    content.prepend(mast);
    content.append(layout);
    refreshDay();
  }
  return {organize, refreshDay};
})();
