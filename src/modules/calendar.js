// Modulo Calendario: calendari interni multipli con colori, viste giorno/settimana/mese/agenda,
// import .ics (file o URL), sincronizzazione periodica, export .ics con avvisi
import { db, settings, setSetting, lookups } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, actionSheet, confirmSheet, toast, openSheet, pageHeader, iconBtn, segmented, empty, pickFile, shareOrDownload, haptic } from '../core/ui.js';
import { ymd, today, parseLocal, toLocalIso, addDays, startOfWeek, weekdayIdx, WD, WD1, MONTHS, cap, fmtTime, fmtDay, fmtDate, relDay, pad, hm, startOfDay, diffDays } from '../core/format.js';
import { getOccurrences, VIRTUAL } from '../core/agenda.js';
import { parseIcs, buildIcs } from '../lib/ics.js';
import { parseRRule, buildRRule, describeRRule } from '../lib/rrule.js';
import { saveAttachments } from '../core/money.js';
import { go } from '../core/router.js';

const VIEWS = [{ value: 'giorno', label: 'Giorno' }, { value: 'settimana', label: 'Settimana' }, { value: 'mese', label: 'Mese' }, { value: 'agenda', label: 'Agenda' }];
const state = { view: 'mese', cursor: new Date(), selected: today() };
const COLORS = ['#0a84ff', '#ff9f0a', '#30d158', '#ff375f', '#bf5af2', '#5e5ce6', '#64d2ff', '#ffd60a', '#ac8e68', '#ff3b30', '#00c7be', '#8e8e93'];
const ALARMS = [{ value: '', label: 'Nessuno' }, { value: 0, label: 'All’ora dell’evento' }, { value: 5, label: '5 minuti prima' }, { value: 10, label: '10 minuti prima' }, { value: 15, label: '15 minuti prima' }, { value: 30, label: '30 minuti prima' }, { value: 60, label: '1 ora prima' }, { value: 120, label: '2 ore prima' }, { value: 1440, label: '1 giorno prima' }, { value: 2880, label: '2 giorni prima' }];

const timeLabel = (o) => (o.allDay ? 'tutto il giorno' : `${fmtTime(o.start)}–${fmtTime(o.end)}`);
const sameDay = (a, b) => ymd(a) === ymd(b);
const coversDay = (o, day) => { const s = startOfDay(day), e = addDays(s, 1); return o.start < e && (o.end > s || (o.allDay && sameDay(o.start, s)) || (!o.allDay && +o.end === +o.start && sameDay(o.start, s))); };

// ---------- Viste ----------
function range() {
  const c = state.cursor;
  if (state.view === 'giorno') return [startOfDay(c), new Date(c.getFullYear(), c.getMonth(), c.getDate(), 23, 59, 59)];
  if (state.view === 'settimana') { const s = startOfWeek(c); return [s, new Date(addDays(s, 7) - 1000)]; }
  if (state.view === 'mese') { const s = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1)); return [s, new Date(addDays(s, 42) - 1000)]; }
  return [startOfDay(new Date()), addDays(startOfDay(new Date()), 90)];
}
function title() {
  const c = state.cursor;
  if (state.view === 'giorno') return fmtDay(c);
  if (state.view === 'settimana') { const s = startOfWeek(c), e = addDays(s, 6); return `${s.getDate()} ${s.getMonth() !== e.getMonth() ? MONTHS[s.getMonth()].slice(0, 3) + ' ' : ''}– ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`; }
  if (state.view === 'mese') return `${cap(MONTHS[c.getMonth()])} ${c.getFullYear()}`;
  return 'Prossimi 90 giorni';
}
const evRow = (o) => html`<button class="row ev-row" data-act="open" data-key="${o.key}"><span class="t">${o.allDay ? 'giorno' : html`${fmtTime(o.start)}<br>${fmtTime(o.end)}`}</span><span class="bar" style="background:${o.color}"></span><span class="row-main"><strong>${o.title}</strong><small>${[o.cal.name, o.ev?.location, o.ev?.rrule ? '↻' : ''].filter(Boolean).join(' · ')}</small></span></button>`;

function monthView(occ) {
  const [s] = range();
  const m = state.cursor.getMonth();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(s, i);
    const list = occ.filter((o) => coversDay(o, d));
    const ds = ymd(d);
    const holiday = list.some((o) => o.cal === VIRTUAL.holidays) || weekdayIdx(d) === 6;
    cells.push(html`<button class="mday ${d.getMonth() !== m ? 'other' : ''} ${ds === today() ? 'today' : ''} ${ds === state.selected ? 'sel' : ''} ${holiday ? 'holiday' : ''}" data-act="pick" data-day="${ds}" aria-label="${fmtDay(d)}, ${list.length} eventi"><span class="n">${d.getDate()}</span><span class="dots">${list.slice(0, 4).map((o) => html`<i style="background:${o.color}"></i>`)}</span></button>`);
  }
  const selDay = new Date(state.selected + 'T00:00');
  const dayList = occ.filter((o) => coversDay(o, selDay));
  return html`<div class="month-grid" data-swipe>${WD1.map((w) => html`<div class="wd">${w}</div>`)}${cells}</div>
    <div class="group-label">${relDay(state.selected)} · ${fmtDate(state.selected, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    ${dayList.length ? html`<div class="list">${dayList.map(evRow)}</div>` : html`<div class="list"><button class="row action" data-act="add" data-day="${state.selected}">Aggiungi evento</button></div>`}`;
}

function timeGrid(occ, days) {
  const H = 48;
  const now = new Date();
  const cols = days.map((d) => {
    const list = occ.filter((o) => !o.allDay && coversDay(o, d));
    // corsie per eventi sovrapposti
    const sorted = list.sort((a, b) => a.start - b.start || b.end - a.end);
    const placed = []; let group = [], groupEnd = 0, ends = [];
    const close = () => { const n = ends.length; group.forEach((g) => (g.n = n)); group = []; ends = []; };
    for (const o of sorted) {
      const s = Math.max(o.start, startOfDay(d)), e = Math.min(o.end > o.start ? o.end : new Date(+o.start + 1800000), addDays(startOfDay(d), 1));
      if (group.length && s >= groupEnd) close();
      let lane = ends.findIndex((x) => x <= s);
      if (lane === -1) { lane = ends.length; ends.push(e); } else ends[lane] = e;
      const p = { o, s, e, lane };
      group.push(p); placed.push(p);
      groupEnd = Math.max(groupEnd, +e);
    }
    if (group.length) close();
    const evs = placed.map((p) => {
      const top = ((p.s - startOfDay(d)) / 3600000) * H, h = Math.max(20, ((p.e - p.s) / 3600000) * H - 2);
      return html`<button class="tg-ev" data-act="open" data-key="${p.o.key}" style="top:${top}px;height:${h}px;left:calc(${(p.lane / p.n) * 100}% + 2px);width:calc(${100 / p.n}% - 4px);background:${p.o.color}">${days.length === 1 ? html`<b>${p.o.title}</b> · ${fmtTime(p.o.start)}${p.o.ev?.location ? ' · ' + p.o.ev.location : ''}` : p.o.title}</button>`;
    });
    const nowLine = sameDay(d, now) ? html`<div class="tg-now" style="top:${((now - startOfDay(now)) / 3600000) * H}px"></div>` : '';
    return html`<div class="tg-col" data-act="slot" data-day="${ymd(d)}" style="height:${24 * H}px">${nowLine}${evs}</div>`;
  });
  const allDay = occ.filter((o) => o.allDay && days.some((d) => coversDay(o, d)));
  const tpl = `40px repeat(${days.length}, 1fr)`;
  return html`<div class="timegrid" data-swipe>
    ${days.length > 1 ? html`<div class="tg-days" style="grid-template-columns:${tpl}"><span></span>${days.map((d) => html`<button class="link ${ymd(d) === today() ? 'today' : ''}" data-act="dayView" data-day="${ymd(d)}" style="min-height:auto">${WD[weekdayIdx(d)]}<b>${d.getDate()}</b></button>`)}</div>` : ''}
    ${allDay.length ? html`<div class="allday">${allDay.map((o) => html`<span role="button" tabindex="0" data-act="open" data-key="${o.key}" style="background:${o.color}">${days.length > 1 ? `${WD1[weekdayIdx(o.start)]} ` : ''}${o.title}</span>`)}</div>` : ''}
    <div class="tg-scroll" data-tg><div class="tg-cols" style="grid-template-columns:${tpl}">
      <div>${Array.from({ length: 24 }, (_, h) => html`<div class="tg-hour">${pad(h)}</div>`)}</div>${cols}
    </div></div></div>`;
}

function agendaView(occ) {
  if (!occ.length) return empty('📅', 'Nessun evento nei prossimi 90 giorni', html`<button class="btn filled" data-act="add">Nuovo evento</button>`);
  const byDay = new Map();
  for (const o of occ) {
    const days = o.allDay ? Math.max(1, diffDays(o.start, o.end) + 1) : 1;
    for (let i = 0; i < Math.min(days, 31); i++) {
      const d = ymd(addDays(o.start, i));
      if (d < today()) continue;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(o);
    }
  }
  return html`${[...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, list]) => html`<div class="group-label">${relDay(d)} · ${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'long' })}</div><div class="list">${list.map(evRow)}</div>`)}`;
}

// ---------- Render ----------
let lastOcc = [];
export async function render(root, route, ctx) {
  if (VIEWS.some((v) => v.value === route.sub)) state.view = route.sub;
  const [from, to] = range();
  const occ = await getOccurrences(from, to);
  lastOcc = occ;
  let body;
  if (state.view === 'mese') body = monthView(occ);
  else if (state.view === 'settimana') body = timeGrid(occ, Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(state.cursor), i)));
  else if (state.view === 'giorno') body = timeGrid(occ, [startOfDay(state.cursor)]);
  else body = agendaView(occ);
  root.innerHTML = String(html`${pageHeader('Calendario', { right: html`${iconBtn('layers', 'calendars', 'Calendari e colori')}${iconBtn('plus', 'add', 'Nuovo evento')}` })}
  <main class="page"><div class="seg-wrap">${segmented(VIEWS, state.view, 'view')}</div>
  ${state.view !== 'agenda' ? html`<div class="cal-head">${iconBtn('left', 'prev', 'Precedente')}<button class="link" data-act="today"><h2>${title()}</h2></button>${iconBtn('right', 'next', 'Successivo')}</div>` : ''}
  ${body}</main>`);
  const refresh = () => ctx.rerender();
  const tg = root.querySelector('[data-tg]');
  if (tg) requestAnimationFrame(() => { tg.scrollTop = (sameDay(state.cursor, new Date()) || state.view === 'settimana' ? Math.max(0, new Date().getHours() - 1) : 7) * 48; });
  const sw = root.querySelector('[data-swipe]');
  if (sw) {
    let x0 = null, y0 = 0;
    sw.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    sw.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { haptic(); move(dx < 0 ? 1 : -1); refresh(); }
    });
  }
  return bindActions(root, {
    view: ({ value }) => { state.view = value; go(`#/calendario/${value}`); },
    prev: () => { move(-1); refresh(); },
    next: () => { move(1); refresh(); },
    today: () => { state.cursor = new Date(); state.selected = today(); refresh(); },
    pick: ({ day }) => { state.selected = day; refresh(); },
    dayView: ({ day }) => { state.cursor = new Date(day + 'T00:00'); state.selected = day; state.view = 'giorno'; go('#/calendario/giorno'); },
    slot: ({ day }, el, e) => {
      if (e.target.closest('.tg-ev')) return;
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(23, Math.floor((e.clientY - r.top) / 48)));
      return openEventForm(null, { start: `${day}T${pad(h)}:00` }).then((ok) => ok && refresh());
    },
    add: async ({ day }) => { if (await openEventForm(null, day || state.view === 'mese' ? { start: `${day || state.selected}T${pad(Math.min(23, new Date().getHours() + 1))}:00` } : {})) refresh(); },
    open: async ({ key }) => { const o = lastOcc.find((x) => x.key === key); if (o && (await eventDetail(o))) refresh(); },
    calendars: async () => { await calendarsSheet(); refresh(); }
  });
}

function move(n) {
  const c = state.cursor;
  if (state.view === 'giorno') state.cursor = addDays(c, n);
  else if (state.view === 'settimana') state.cursor = addDays(c, 7 * n);
  else if (state.view === 'mese') { state.cursor = new Date(c.getFullYear(), c.getMonth() + n, 1); state.selected = ymd(sameDay(new Date(), state.cursor) || (state.cursor.getMonth() === new Date().getMonth() && state.cursor.getFullYear() === new Date().getFullYear()) ? new Date() : state.cursor); }
  if (state.view !== 'mese') state.selected = ymd(state.cursor);
}

// ---------- Dettaglio evento ----------
async function eventDetail(o) {
  if (o.virtual) {
    if (o.link) { go(o.link); return false; }
    toast(o.title); return false;
  }
  const ev = o.ev;
  const atts = await db.attachments.filter((a) => a.ownerType === 'event' && a.ownerId === ev.id).toArray();
  const rr = ev.rrule ? describeRRule(ev.rrule) : '';
  const alarm = ALARMS.find((a) => String(a.value) === String(ev.alarm ?? ''))?.label || (ev.alarm != null ? `${ev.alarm} minuti prima` : 'Nessuno');
  const readOnly = o.cal.source === 'url';
  const choice = await openSheet({
    title: 'Evento',
    body: String(html`<div class="card"><h2 style="font-size:1.35em;display:flex;gap:10px;align-items:center"><span class="dot" style="background:${o.color};width:14px;height:14px"></span>${ev.title}</h2>
      <p>${fmtDay(o.start)}<br><span class="muted">${timeLabel(o)}${rr ? ` · ${rr}` : ''}</span></p>
      ${ev.location ? html`<p>📍 <a href="https://maps.apple.com/?q=${encodeURIComponent(ev.location)}" target="_blank" rel="noopener">${ev.location}</a></p>` : ''}
      <p class="muted">📅 ${o.cal.name}${readOnly ? ' (sincronizzato, sola lettura)' : ''} · 🔔 ${alarm}</p>
      ${ev.notes ? html`<p class="journal-text">${ev.notes}</p>` : ''}
      ${atts.length ? html`<div class="thumbs">${atts.map((a) => raw(`<img alt="Allegato" src="${URL.createObjectURL(a.blob)}">`))}</div>` : ''}</div>
      <div class="list" style="margin-top:14px">
        ${readOnly ? '' : html`<button class="row action" data-r="edit">Modifica</button>`}
        <button class="row action" data-r="dup">Duplica</button>
        <button class="row action" data-r="ics">Esporta .ics (con avviso)</button>
        ${readOnly ? '' : ev.rrule ? html`<button class="row action danger" data-r="delOne">Elimina solo questa occorrenza</button><button class="row action danger" data-r="delAll">Elimina tutta la serie</button>` : html`<button class="row action danger" data-r="delAll">Elimina evento</button>`}
      </div>`),
    onMount: ({ el, close }) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r); })
  });
  if (choice === 'edit') return openEventForm(ev);
  if (choice === 'dup') { const { id, uid, ...copy } = ev; return openEventForm(null, { ...copy, calendarId: ev.calendarId }); }
  if (choice === 'ics') { await shareIcs([{ ...ev, start: toLocalIso(o.start), end: toLocalIso(o.end), rrule: '' }], ev.title); return false; }
  if (choice === 'delOne') { await db.events.update(ev.id, { exdates: [...(ev.exdates || []), toLocalIso(o.start)] }); toast('Occorrenza eliminata'); return true; }
  if (choice === 'delAll' && (await confirmSheet(ev.rrule ? 'Eliminare tutta la serie?' : 'Eliminare l’evento?', { okLabel: 'Elimina', danger: true }))) {
    await db.events.delete(ev.id);
    toast('Evento eliminato', { action: { label: 'Annulla', run: () => db.events.put(ev) } });
    return true;
  }
  return false;
}

// ---------- Form evento (usato anche da "Oggi") ----------
export async function openEventForm(ev = null, preset = {}) {
  const { calendars } = await lookups();
  const editable = calendars.filter((c) => c.source !== 'url');
  if (!editable.length) { toast('Crea prima un calendario', { type: 'error' }); return false; }
  const base = ev || { calendarId: editable[0].id, start: `${today()}T${pad(Math.min(23, new Date().getHours() + 1))}:00`, allDay: false, alarm: 15, ...preset };
  const s = parseLocal(base.start);
  const e = base.end ? parseLocal(base.end) : new Date(s.getTime() + 3600000);
  const r = parseRRule(base.rrule) || {};
  const freqVal = r.freq || '';
  const values = {
    ...base, sDate: ymd(s), sTime: hm(s), eDate: ymd(e), eTime: hm(e), freq: freqVal, interval: r.interval || 1,
    byday: (r.byday || []).filter((b) => !b.n).map((b) => b.day), until: r.until ? ymd(r.until) : '', alarm: base.alarm ?? '', colorMode: base.color ? 'custom' : 'cal', color: base.color || '#0a84ff'
  };
  const res = await formSheet({
    title: ev ? 'Modifica evento' : 'Nuovo evento', values, deleteLabel: ev ? 'Elimina evento' : null,
    fields: [
      { name: 'title', label: 'Titolo', required: true, autofocus: !ev, placeholder: 'es. Dentista' },
      { name: 'location', label: 'Luogo' },
      { name: 'calendarId', label: 'Calendario', type: 'select', options: editable.map((c) => ({ value: c.id, label: `● ${c.name}` })), group: 1 },
      { name: 'colorMode', label: 'Colore', type: 'select', options: [{ value: 'cal', label: 'Del calendario' }, { value: 'custom', label: 'Personalizzato' }], group: 1 },
      { name: 'color', label: 'Colore evento', type: 'color', showIf: (x) => x.colorMode === 'custom', group: 1 },
      { name: 'allDay', label: 'Tutto il giorno', type: 'checkbox', group: 2 },
      { name: 'sDate', label: 'Inizio', type: 'date', required: true, group: 2 },
      { name: 'sTime', label: 'Ora inizio', type: 'time', showIf: (x) => !x.allDay, group: 2 },
      { name: 'eDate', label: 'Fine', type: 'date', group: 2 },
      { name: 'eTime', label: 'Ora fine', type: 'time', showIf: (x) => !x.allDay, group: 2 },
      { name: 'freq', label: 'Ripeti', type: 'select', options: [{ value: '', label: 'Mai' }, { value: 'DAILY', label: 'Ogni giorno' }, { value: 'WEEKLY', label: 'Ogni settimana' }, { value: 'MONTHLY', label: 'Ogni mese' }, { value: 'YEARLY', label: 'Ogni anno' }], group: 3 },
      { name: 'interval', label: 'Ogni (n)', type: 'number', min: 1, step: 1, showIf: (x) => !!x.freq, group: 3 },
      { name: 'byday', label: 'Nei giorni', type: 'chips', options: WD.map((w, i) => ({ value: i, label: w })), showIf: (x) => x.freq === 'WEEKLY', group: 3 },
      { name: 'until', label: 'Fino al', type: 'date', showIf: (x) => !!x.freq, group: 3 },
      { name: 'alarm', label: 'Avviso', type: 'select', options: ALARMS, group: 4 },
      { name: 'notes', label: 'Note', type: 'textarea', rows: 3, group: 5 },
      { name: 'photos', label: 'Allegati (foto)', type: 'image', group: 5 }
    ],
    validate: (x) => {
      const st = x.allDay ? `${x.sDate}T00:00` : `${x.sDate}T${x.sTime || '00:00'}`;
      const en = x.allDay ? `${x.eDate || x.sDate}T23:59` : `${x.eDate || x.sDate}T${x.eTime || x.sTime}`;
      return en < st ? 'La fine è prima dell’inizio' : null;
    },
    onMount: ({ form }) => {
      form.elements.sDate.addEventListener('change', () => { if (!form.elements.eDate.value || form.elements.eDate.value < form.elements.sDate.value) form.elements.eDate.value = form.elements.sDate.value; });
      form.elements.sTime && form.elements.sTime.addEventListener('change', () => {
        const [h, m] = form.elements.sTime.value.split(':').map(Number);
        if (form.elements.eDate.value === form.elements.sDate.value && form.elements.eTime.value <= form.elements.sTime.value) form.elements.eTime.value = `${pad(Math.min(23, h + 1))}:${pad(m)}`;
      });
    }
  });
  if (!res) return false;
  if (res.__delete) { await db.events.delete(ev.id); toast('Evento eliminato'); return true; }
  const rec = {
    ...(ev || {}), title: res.title, location: res.location, calendarId: res.calendarId, allDay: res.allDay,
    start: res.allDay ? `${res.sDate}T00:00` : `${res.sDate}T${res.sTime || '09:00'}`,
    end: res.allDay ? `${res.eDate || res.sDate}T23:59` : `${res.eDate || res.sDate}T${res.eTime || res.sTime || '10:00'}`,
    rrule: res.freq ? buildRRule({ freq: res.freq, interval: res.interval || 1, byday: res.freq === 'WEEKLY' ? res.byday : [], until: res.until }) : '',
    exdates: ev?.exdates || [], alarm: res.alarm === '' ? null : Number(res.alarm), notes: res.notes, color: res.colorMode === 'custom' ? res.color : null,
    uid: ev?.uid || `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}@vita`, updatedAt: Date.now()
  };
  const id = await db.events.put(rec);
  if (res.photos?.length) await saveAttachments('event', id, res.photos);
  toast(ev ? 'Evento aggiornato' : 'Evento creato');
  return true;
}

// ---------- Calendari ----------
async function calendarsSheet() {
  for (;;) {
    const cals = await db.calendars.toArray();
    const counts = new Map();
    for (const e of await db.events.toArray()) counts.set(e.calendarId, (counts.get(e.calendarId) || 0) + 1);
    const srcLabel = { local: 'Interno', file: 'Importato da file', url: 'Sincronizzato da URL' };
    const choice = await openSheet({
      title: 'Calendari',
      body: String(html`<p class="caption" style="margin:0 4px 10px">Tutti i calendari vivono dentro l’app e restano salvati sul telefono. Tocca il pallino per mostrarli o nasconderli.</p>
        <div class="list">${cals.map((c) => html`<div class="row"><button class="check ${c.visible !== false ? 'on' : ''}" style="${c.visible !== false ? `background:${c.color};border-color:${c.color}` : `border-color:${c.color}`}" data-c="toggle:${c.id}" aria-label="Mostra ${c.name}" aria-pressed="${c.visible !== false}">${c.visible !== false ? icon('check') : ''}</button>
          <button class="row-main link" style="text-align:left;color:var(--text)" data-c="edit:${c.id}"><strong>${c.name}</strong><small>${srcLabel[c.source] || 'Interno'} · ${counts.get(c.id) || 0} eventi${c.lastSync ? ` · agg. ${new Date(c.lastSync).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</small></button></div>`)}
          ${[['showHolidays', VIRTUAL.holidays], ['showDeadlines', VIRTUAL.deadlines]].map(([k, v]) => html`<div class="row"><button class="check ${settings[k] ? 'on' : ''}" style="${settings[k] ? `background:${v.color};border-color:${v.color}` : `border-color:${v.color}`}" data-c="virt:${k}" aria-pressed="${!!settings[k]}">${settings[k] ? icon('check') : ''}</button><span class="row-main"><strong>${v.name}</strong><small>Automatico</small></span></div>`)}
        </div>
        <div class="list" style="margin-top:16px">
          <button class="row action" data-c="new">Nuovo calendario</button>
          <button class="row action" data-c="importFile">Importa file .ics</button>
          <button class="row action" data-c="importUrl">Aggiungi da URL (iCloud, Google, Outlook)</button>
          ${cals.some((c) => c.source === 'url') ? html`<button class="row action" data-c="sync">Sincronizza ora</button>` : ''}
          <button class="row action" data-c="exportAll">Esporta tutto in .ics</button>
        </div>`),
      onMount: ({ el, close }) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) { haptic(); close(b.dataset.c); } })
    });
    if (!choice) return;
    const [cmd, arg] = choice.split(':');
    try {
      if (cmd === 'toggle') { const c = await db.calendars.get(Number(arg)); await db.calendars.update(c.id, { visible: c.visible === false }); }
      else if (cmd === 'virt') await setSetting(arg, !settings[arg]);
      else if (cmd === 'edit') await calForm(await db.calendars.get(Number(arg)));
      else if (cmd === 'new') await calForm(null);
      else if (cmd === 'importFile') await importIcsFile();
      else if (cmd === 'importUrl') await addUrlCalendar();
      else if (cmd === 'sync') await syncSubscriptions(true);
      else if (cmd === 'exportAll') {
        const ev = await db.events.toArray();
        await shareIcs(ev, 'Vita – tutti i calendari');
      }
    } catch (e) { toast(e.message || 'Operazione non riuscita', { type: 'error' }); }
  }
}

async function calForm(c) {
  const isUrl = c?.source === 'url';
  const res = await formSheet({
    title: c ? 'Calendario' : 'Nuovo calendario', values: c || { color: COLORS[Math.floor(Math.random() * COLORS.length)], visible: true }, deleteLabel: c ? 'Elimina calendario e i suoi eventi' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !c },
      { name: 'color', label: 'Colore', type: 'color' },
      { name: 'visible', label: 'Visibile', type: 'checkbox' },
      ...(isUrl ? [{ name: 'url', label: 'URL', type: 'url', group: 1 }] : []),
      ...(c ? [{ name: 'exportIt', label: 'Esporta questo calendario (.ics)', type: 'checkbox', group: 2 }] : [])
    ],
    extraTop: `<div class="chips" style="margin-bottom:14px">${COLORS.map((x) => `<button type="button" class="chip" data-pick="${x}" aria-label="Colore ${x}" style="background:${x};width:36px;padding:0"></button>`).join('')}</div>`,
    onMount: ({ form }) => form.addEventListener('click', (e) => { const p = e.target.closest('[data-pick]'); if (p) { form.elements.color.value = p.dataset.pick; haptic(); } })
  });
  if (!res) return;
  if (res.__delete) {
    await db.transaction('rw', db.calendars, db.events, async () => { await db.events.where('calendarId').equals(c.id).delete(); await db.calendars.delete(c.id); });
    toast('Calendario eliminato'); return;
  }
  const { exportIt, ...rest } = res;
  const id = await db.calendars.put({ ...(c || { source: 'local' }), ...rest });
  if (exportIt) await shareIcs(await db.events.where('calendarId').equals(id).toArray(), rest.name, rest.color);
}

async function upsertEvents(calendarId, events, { replace = false } = {}) {
  const existing = await db.events.where('calendarId').equals(calendarId).toArray();
  const byUid = new Map(existing.map((e) => [e.uid, e]));
  const seen = new Set();
  let added = 0, updated = 0;
  await db.transaction('rw', db.events, async () => {
    for (const e of events) {
      seen.add(e.uid);
      const old = byUid.get(e.uid);
      const rec = { ...e, calendarId, color: e.color || null, updatedAt: Date.now() };
      delete rec.status; delete rec.recurrenceId;
      if (old) { await db.events.put({ ...old, ...rec, id: old.id }); updated++; } else { await db.events.add(rec); added++; }
    }
    if (replace) for (const old of existing) if (!seen.has(old.uid)) await db.events.delete(old.id);
  });
  return { added, updated };
}

async function importIcsFile() {
  const f = await pickFile('.ics,text/calendar');
  if (!f) return;
  const cal = parseIcs(await f.text());
  if (!cal.events.length) throw new Error('Nessun evento trovato nel file');
  const cals = await db.calendars.filter((c) => c.source !== 'url').toArray();
  const target = await actionSheet(`${cal.events.length} eventi trovati: dove li metto?`, [
    { label: `Nuovo calendario “${cal.name || f.name.replace(/\.ics$/i, '')}”`, value: 'new', icon: '➕' },
    ...cals.map((c) => ({ label: c.name, value: c.id, icon: '●' }))
  ]);
  if (target == null) return;
  const id = target === 'new' ? await db.calendars.add({ name: cal.name || f.name.replace(/\.ics$/i, ''), color: cal.color || COLORS[(await db.calendars.count()) % COLORS.length], source: 'file', visible: true }) : target;
  const r = await upsertEvents(id, cal.events);
  toast(`Importati ${r.added} nuovi eventi, ${r.updated} aggiornati`);
}

async function addUrlCalendar() {
  const res = await formSheet({
    title: 'Calendario da URL', submitLabel: 'Aggiungi',
    fields: [
      { name: 'url', label: 'Indirizzo .ics', type: 'url', required: true, placeholder: 'webcal://… oppure https://…ics', autofocus: true },
      { name: 'name', label: 'Nome', placeholder: 'es. Lavoro (Google)' },
      { name: 'color', label: 'Colore', type: 'color', value: '#ff9f0a' }
    ],
    extraTop: `<p class="caption" style="margin:0 4px 12px">Gli eventi vengono copiati dentro l’app e restano visibili anche offline. Ogni 6 ore (all’apertura) Vita li aggiorna. I calendari di Google e iCloud bloccano la lettura diretta dal browser: serve il piccolo “ponte” gratuito descritto nella guida (Cloudflare Worker), da impostare in Impostazioni → Calendari.</p>`
  });
  if (!res) return;
  const id = await db.calendars.add({ name: res.name || 'Calendario sincronizzato', color: res.color, source: 'url', url: res.url, visible: true });
  try { await syncOne(await db.calendars.get(id)); toast('Calendario sincronizzato'); }
  catch (e) { toast(`Aggiunto, ma la sincronizzazione non è riuscita: ${e.message}`, { type: 'error', ms: 6000 }); }
}

async function fetchIcs(url) {
  const u = url.trim().replace(/^webcal:/i, 'https:');
  if (settings.icsProxy) {
    const res = await fetch(settings.icsProxy.replace(/\/$/, '') + '/ics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.icsToken}` },
      body: JSON.stringify({ url: u })
    });
    if (!res.ok) throw new Error(`Ponte calendario: errore ${res.status}`);
    return res.text();
  }
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Errore ${res.status}`);
  return res.text();
}
async function syncOne(c) {
  let text;
  try { text = await fetchIcs(c.url); } catch (e) { throw new Error(e.message === 'Failed to fetch' || e.name === 'TypeError' ? 'accesso bloccato dal server (configura il ponte in Impostazioni → Calendari)' : e.message); }
  const cal = parseIcs(text);
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('la risposta non è un calendario .ics');
  await upsertEvents(c.id, cal.events, { replace: true });
  await db.calendars.update(c.id, { lastSync: new Date().toISOString(), lastError: null });
}
/** Aggiorna i calendari da URL (all'avvio se più vecchi di 6 ore, o su richiesta) */
export async function syncSubscriptions(force = false) {
  const subs = await db.calendars.where('source').equals('url').toArray();
  let ok = 0;
  for (const c of subs) {
    if (!force && c.lastSync && Date.now() - new Date(c.lastSync).getTime() < 6 * 3600000) continue;
    try { await syncOne(c); ok++; } catch (e) { await db.calendars.update(c.id, { lastError: e.message }); if (force) toast(`${c.name}: ${e.message}`, { type: 'error', ms: 6000 }); }
  }
  if (force && ok) toast(`${ok} calendari aggiornati`);
}

async function shareIcs(events, name, color = '') {
  const text = buildIcs(events, { name, color });
  const safe = name.replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'evento';
  await shareOrDownload(new Blob([text], { type: 'text/calendar' }), `${safe}.ics`, name);
}
