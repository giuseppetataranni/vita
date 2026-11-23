// Routine, abitudini, obiettivi e schedule settimanale
import { db } from '../core/db.js';
import { html, raw, icon, bindActions, formSheet, actionSheet, confirmSheet, toast, openSheet, pageHeader, iconBtn, segmented, swipeRow, progress, empty, haptic, pulse } from '../core/ui.js';
import { ymd, today, addDays, weekdayIdx, WD, WD_LONG, fmtDate, parseYmd, hm, uid, cap, diffDays, relDay } from '../core/format.js';
import { heatmap, ring } from '../lib/charts.js';
import { go } from '../core/router.js';

const SUBS = [{ value: 'routine', label: 'Routine' }, { value: 'abitudini', label: 'Abitudini' }, { value: 'obiettivi', label: 'Obiettivi' }, { value: 'schedule', label: 'Schedule' }];
export const GOAL_CATS = { salute: ['🩺', 'Salute'], carriera: ['💼', 'Carriera'], finanze: ['💶', 'Finanze'], relazioni: ['❤️', 'Relazioni'], apprendimento: ['📚', 'Apprendimento'], personale: ['🌱', 'Personale'] };
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TEMPLATES = {
  mattina: { name: 'Routine del mattino', emoji: '🌅', time: '07:00', items: ['Bicchiere d’acqua', 'Letto rifatto', '5 minuti di respiro', 'Stretching', 'Colazione', 'Tre priorità del giorno'] },
  sera: { name: 'Routine serale', emoji: '🌙', time: '22:00', items: ['Prepara le cose per domani', 'Diario e gratitudine', 'Niente schermi', 'Lettura 15 minuti'] },
  studio: { name: 'Studio', emoji: '📚', time: '15:00', items: ['Obiettivo della sessione', 'Pomodoro 1 (25 min)', 'Pausa', 'Pomodoro 2 (25 min)', 'Ripasso e appunti'] },
  allenamento: { name: 'Allenamento', emoji: '🏋️', time: '18:30', items: ['Riscaldamento 10 min', 'Esercizi principali', 'Defaticamento', 'Stretching', 'Registra l’allenamento'] }
};

// ---------- Dati condivisi (usati anche da Oggi e Revisione) ----------
export async function routinesForDay(dateStr = today()) {
  const wd = weekdayIdx(parseYmd(dateStr));
  const [routines, logs] = await Promise.all([db.routines.toArray(), db.routineLogs.where('date').equals(dateStr).toArray()]);
  const done = new Set(logs.map((l) => `${l.routineId}:${l.itemId}`));
  return routines.filter((r) => r.active !== false && (r.days || ALL_DAYS).includes(wd)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
    .map((r) => ({ ...r, items: (r.items || []).map((i) => ({ ...i, done: done.has(`${r.id}:${i.id}`) })), doneCount: (r.items || []).filter((i) => done.has(`${r.id}:${i.id}`)).length }));
}
export async function toggleRoutineItem(routineId, itemId, dateStr = today()) {
  const ex = await db.routineLogs.where('[routineId+itemId+date]').equals([routineId, itemId, dateStr]).first();
  if (ex) await db.routineLogs.delete(ex.id); else await db.routineLogs.add({ routineId, itemId, date: dateStr });
  haptic();
  return !ex;
}
async function routineDayRatio(days) {
  const [routines, logs] = await Promise.all([db.routines.toArray(), db.routineLogs.where('date').aboveOrEqual(ymd(addDays(new Date(), -days))).toArray()]);
  const byDate = new Map();
  for (const l of logs) byDate.set(l.date, (byDate.get(l.date) || 0) + 1);
  return (d) => {
    const wd = weekdayIdx(d);
    const total = routines.filter((r) => r.active !== false && (r.days || ALL_DAYS).includes(wd) && (!r.createdAt || ymd(d) >= ymd(new Date(r.createdAt)))).reduce((a, r) => a + (r.items || []).length, 0);
    if (!total) return null;
    return Math.min(1, (byDate.get(ymd(d)) || 0) / total);
  };
}
export async function routineRatioFn(days = 200) { return routineDayRatio(days); }

function streakOf(isScheduled, isDone, maxDays = 400) {
  let s = 0;
  let d = new Date();
  if (isScheduled(d) && !isDone(d)) d = addDays(d, -1);
  for (let i = 0; i < maxDays; i++, d = addDays(d, -1)) {
    if (!isScheduled(d)) continue;
    if (isDone(d)) s++; else break;
  }
  return s;
}
async function routineStats(r) {
  const logs = await db.routineLogs.where('routineId').equals(r.id).toArray();
  const by = new Map();
  for (const l of logs) by.set(l.date, (by.get(l.date) || 0) + 1);
  const n = (r.items || []).length || 1;
  const sched = (d) => (r.days || ALL_DAYS).includes(weekdayIdx(d)) && (!r.createdAt || ymd(d) >= ymd(new Date(r.createdAt)));
  const streak = streakOf(sched, (d) => (by.get(ymd(d)) || 0) >= n);
  let tot = 0, got = 0;
  for (let i = 0; i < 30; i++) { const d = addDays(new Date(), -i); if (sched(d)) { tot += n; got += Math.min(n, by.get(ymd(d)) || 0); } }
  return { streak, adherence: tot ? got / tot : 0 };
}

export async function habitsForDay(dateStr = today()) {
  const wd = weekdayIdx(parseYmd(dateStr));
  const [habits, logs] = await Promise.all([db.habits.toArray(), db.habitLogs.where('date').equals(dateStr).toArray()]);
  const cnt = new Map(logs.map((l) => [l.habitId, l.count || 1]));
  return habits.filter((h) => h.active !== false && (h.days || ALL_DAYS).includes(wd)).map((h) => ({ ...h, count: cnt.get(h.id) || 0, done: (cnt.get(h.id) || 0) >= (h.target || 1) }));
}
export async function tapHabit(habitId, dateStr = today()) {
  const h = await db.habits.get(habitId);
  const ex = await db.habitLogs.where('[habitId+date]').equals([habitId, dateStr]).first();
  const target = h.target || 1;
  const cur = ex?.count || 0;
  haptic();
  if (cur >= target) { if (ex) await db.habitLogs.delete(ex.id); return 0; }
  if (ex) await db.habitLogs.update(ex.id, { count: cur + 1 }); else await db.habitLogs.add({ habitId, date: dateStr, count: 1 });
  return cur + 1;
}
async function habitStats(h) {
  const logs = await db.habitLogs.where('habitId').equals(h.id).toArray();
  const by = new Map(logs.map((l) => [l.date, l.count || 1]));
  const target = h.target || 1;
  const sched = (d) => (h.days || ALL_DAYS).includes(weekdayIdx(d)) && (!h.createdAt || ymd(d) >= ymd(new Date(h.createdAt)));
  const done = (d) => (by.get(ymd(d)) || 0) >= target;
  let tot = 0, got = 0;
  for (let i = 0; i < 30; i++) { const d = addDays(new Date(), -i); if (sched(d)) { tot++; if (done(d)) got++; } }
  const week = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6)).map((d) => ({ d, on: done(d), sched: sched(d) }));
  return { streak: streakOf(sched, done), adherence: tot ? got / tot : 0, week, by };
}

/** Schedule testuale: righe "07:00-07:30 Attività" oppure "07:00 Attività" */
export function parseSchedule(text) {
  const items = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.trim().match(/^(\d{1,2})[:.](\d{2})(?:\s*[-–]\s*(\d{1,2})[:.](\d{2}))?\s+(.+)$/);
    if (m) items.push({ start: `${m[1].padStart(2, '0')}:${m[2]}`, end: m[3] ? `${m[3].padStart(2, '0')}:${m[4]}` : null, text: m[5].trim() });
  }
  items.sort((a, b) => a.start.localeCompare(b.start));
  items.forEach((it, i) => { if (!it.end) it.end = items[i + 1]?.start || '23:59'; });
  return items;
}
export async function nowNext(date = new Date()) {
  const row = await db.schedule.get(weekdayIdx(date));
  const items = parseSchedule(row?.text);
  const t = hm(date);
  return { now: items.find((i) => i.start <= t && t < i.end) || null, next: items.find((i) => i.start > t) || null, items };
}

export const goalProgress = (g) => {
  const ms = g.milestones || [];
  if (g.status === 'done') return 1;
  if (g.progressMode === 'manual' || !ms.length) return Math.max(0, Math.min(1, Number(g.manualProgress) || 0));
  return ms.filter((m) => m.done).length / ms.length;
};

// ---------- Viste ----------
async function routineView() {
  const list = await routinesForDay();
  const all = await db.routines.toArray();
  const ratio = await routineDayRatio(200);
  const stats = new Map(await Promise.all(all.map(async (r) => [r.id, await routineStats(r)])));
  const todayIds = new Set(list.map((r) => r.id));
  return html`
  <h2 class="section-title">Oggi</h2>
  ${list.length ? list.map((r) => html`<div class="card" style="margin-bottom:12px"><h3><span>${r.emoji || '✅'} ${r.name}${r.time ? ` · ${r.time}` : ''}</span><span class="streak">🔥 ${stats.get(r.id)?.streak || 0}</span></h3>
    ${progress(r.doneCount / ((r.items || []).length || 1), r.doneCount === r.items.length ? 'good' : '')}
    <div class="list" style="margin-top:10px">${r.items.map((i) => html`<button class="row ${i.done ? 'done' : ''}" data-act="toggle" data-r="${r.id}" data-i="${i.id}" role="checkbox" aria-checked="${i.done}"><span class="check ${i.done ? 'on' : ''}">${i.done ? icon('check') : ''}</span><span class="row-main"><strong>${i.text}</strong></span>${i.time ? html`<span class="row-end">${i.time}</span>` : ''}</button>`)}</div></div>`) : empty('🗓️', 'Nessuna routine per oggi')}
  <h2 class="section-title">Aderenza <span class="muted small">ultimi 6 mesi</span></h2>
  <div class="card">${raw(heatmap(ratio, new Date(), { weeks: 26, col: 'var(--green)' }))}</div>
  <h2 class="section-title">Tutte le routine <button class="link" data-act="addRoutine">Aggiungi</button></h2>
  ${all.length ? html`<div class="list">${all.map((r) => { const s = stats.get(r.id); return swipeRow(html`<button class="row has-ic" data-act="editRoutine" data-id="${r.id}"><span class="row-ic">${r.emoji || '✅'}</span><span class="row-main"><strong>${r.name}${r.active === false ? ' (in pausa)' : ''}</strong><small>${(r.days || ALL_DAYS).length === 7 ? 'Ogni giorno' : (r.days || []).map((d) => WD[d]).join(' ')} · ${(r.items || []).length} attività · aderenza 30gg ${Math.round(s.adherence * 100)}%${todayIds.has(r.id) ? '' : ' · non oggi'}</small></span><span class="streak">🔥 ${s.streak}</span></button>`, html`<button data-act="delRoutine" data-id="${r.id}">Elimina</button>`); })}</div>` : ''}
  <div class="chips" style="margin-top:12px">${Object.entries(TEMPLATES).map(([k, t]) => html`<button class="chip" data-act="template" data-k="${k}">+ ${t.emoji} ${t.name}</button>`)}</div>`;
}

async function habitsView() {
  const habits = await db.habits.toArray();
  const todayList = await habitsForDay();
  const goals = new Map((await db.goals.toArray()).map((g) => [g.id, g]));
  const stats = new Map(await Promise.all(habits.map(async (h) => [h.id, await habitStats(h)])));
  return html`
  <h2 class="section-title">Oggi</h2>
  ${todayList.length ? html`<div class="list">${todayList.map((h) => html`<button class="row has-ic ${h.done ? 'done' : ''}" data-act="habit" data-id="${h.id}" role="checkbox" aria-checked="${h.done}"><span class="check ${h.done ? 'on' : ''}">${h.done ? icon('check') : h.target > 1 ? h.count : ''}</span><span class="row-main"><strong>${h.emoji || '🔁'} ${h.name}</strong><small>${h.target > 1 ? `${h.count}/${h.target} · ` : ''}${h.goalId && goals.get(h.goalId) ? `🎯 ${goals.get(h.goalId).title}` : ''}</small></span><span class="streak">🔥 ${stats.get(h.id).streak}</span></button>`)}</div>` : empty('🔁', 'Nessuna abitudine per oggi')}
  <h2 class="section-title">Tutte le abitudini <button class="link" data-act="addHabit">Aggiungi</button></h2>
  ${habits.map((h) => { const s = stats.get(h.id); return html`<div class="card" style="margin-bottom:10px"><h3><button class="link" style="color:var(--text);font-weight:600;padding:0" data-act="editHabit" data-id="${h.id}">${h.emoji || '🔁'} ${h.name}</button><span class="streak">🔥 ${s.streak} · ${Math.round(s.adherence * 100)}%</span></h3>
    <div class="week-dots" aria-label="Ultimi 7 giorni">${s.week.map((w) => html`<i class="${w.on ? 'on' : ''}" title="${fmtDate(w.d)}" style="${w.sched ? '' : 'opacity:.3'}"></i>`)}</div>
    <div style="margin-top:10px">${raw(heatmap((d) => { const c = s.by.get(ymd(d)); return c ? Math.min(1, c / (h.target || 1)) : null; }, new Date(), { weeks: 18, col: 'var(--accent)' }))}</div></div>`; })}`;
}

async function goalsView() {
  const goals = await db.goals.toArray();
  const habits = await db.habits.toArray();
  const groups = ['active', 'paused', 'done'];
  const labels = { active: 'In corso', paused: 'In pausa', done: 'Completati' };
  return html`<div class="btn-row"><button class="btn tinted" data-act="review">📝 Revisione settimanale guidata</button></div>
  ${goals.length ? groups.map((st) => { const list = goals.filter((g) => (g.status || 'active') === st); return list.length ? html`<h2 class="section-title">${labels[st]}</h2>${list.sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9')).map((g) => {
    const p = goalProgress(g);
    const left = g.deadline ? diffDays(new Date(), parseYmd(g.deadline)) : null;
    const hs = habits.filter((h) => h.goalId === g.id);
    return html`<div class="card" style="margin-bottom:12px"><div class="donut-wrap" style="align-items:flex-start">${raw(ring(p, { size: 64, thickness: 7, label: `${Math.round(p * 100)}%` }))}
      <div style="flex:1;min-width:0"><button class="link" style="color:var(--text);font-weight:600;font-size:1.05em;padding:0;text-align:left;min-height:auto" data-act="editGoal" data-id="${g.id}">${GOAL_CATS[g.category]?.[0] || '🎯'} ${g.title}</button>
      <div class="muted small">${GOAL_CATS[g.category]?.[1] || ''}${g.deadline ? ` · ${left >= 0 ? `${left} giorni rimasti` : `scaduto da ${-left} giorni`} (${fmtDate(g.deadline)})` : ''}</div>
      ${g.why ? html`<div class="small" style="margin-top:4px">Perché: ${g.why}</div>` : ''}</div></div>
      ${(g.milestones || []).length ? html`<div class="list" style="margin-top:10px">${g.milestones.map((m) => html`<button class="row ${m.done ? 'done' : ''}" data-act="milestone" data-g="${g.id}" data-m="${m.id}" role="checkbox" aria-checked="${!!m.done}"><span class="check ${m.done ? 'on' : ''}">${m.done ? icon('check') : ''}</span><span class="row-main"><strong>${m.text}</strong>${m.due ? html`<small>entro ${fmtDate(m.due)}</small>` : ''}</span></button>`)}</div>` : ''}
      ${hs.length ? html`<div class="chips" style="margin-top:10px">${hs.map((h) => html`<span class="chip">🔁 ${h.name}</span>`)}</div>` : ''}</div>`;
  })}` : ''; }) : empty('🎯', 'Definisci un obiettivo con traguardi intermedi e una scadenza', html`<button class="btn filled" data-act="addGoal">Nuovo obiettivo</button>`)}
  <button class="btn block" data-act="addGoal">${icon('plus')} Nuovo obiettivo</button>`;
}

async function scheduleView() {
  const rows = new Map((await db.schedule.toArray()).map((r) => [r.weekday, r.text]));
  const nn = await nowNext();
  return html`<div class="card now-next"><div class="now"><div class="muted small">Adesso</div><strong>${nn.now ? `${nn.now.text}` : 'Tempo libero'}</strong>${nn.now ? html`<div class="muted small">${nn.now.start}–${nn.now.end}</div>` : ''}</div>
    <div class="next"><div class="muted small">Prossimo</div><strong>${nn.next ? nn.next.text : 'Niente in programma'}</strong>${nn.next ? html`<div class="muted small">alle ${nn.next.start}</div>` : ''}</div></div>
  <p class="caption">Scrivi una riga per attività, ad esempio “07:00-07:30 Colazione” oppure “09:00 Lavoro”. La fine, se manca, è l’inizio dell’attività successiva.</p>
  <div class="list" style="margin-top:12px">${WD_LONG.map((name, i) => { const items = parseSchedule(rows.get(i)); return html`<button class="row" data-act="editDay" data-day="${i}"><span class="row-main wrap"><strong>${cap(name)}${i === weekdayIdx(new Date()) ? ' · oggi' : ''}</strong><small class="sched-day">${items.length ? items.map((x) => `${x.start} ${x.text}`).join(' · ') : 'Vuoto'}</small></span>${icon('chev', 'chev')}</button>`; })}</div>
  <button class="btn block" data-act="copyDay">Copia un giorno sugli altri</button>`;
}

export async function render(root, route, ctx) {
  const sub = SUBS.some((s) => s.value === route.sub) ? route.sub : 'routine';
  const body = await { routine: routineView, abitudini: habitsView, obiettivi: goalsView, schedule: scheduleView }[sub]();
  const add = { routine: 'addRoutine', abitudini: 'addHabit', obiettivi: 'addGoal', schedule: 'editDay' }[sub];
  root.innerHTML = String(html`${pageHeader('Routine', { right: iconBtn('plus', add, 'Aggiungi') })}<main class="page"><div class="seg-wrap">${segmented(SUBS, sub, 'sub')}</div>${body}</main>`);
  const refresh = () => ctx.rerender();
  return bindActions(root, {
    sub: ({ value }) => go(`#/routine/${value}`),
    toggle: async ({ r, i }, el) => { await toggleRoutineItem(Number(r), i); pulse(el); refresh(); },
    addRoutine: async () => { if (await routineForm()) refresh(); },
    editRoutine: async ({ id }) => { if (await routineForm(await db.routines.get(Number(id)))) refresh(); },
    delRoutine: async ({ id }) => { if (await confirmSheet('Eliminare la routine e il suo storico?', { okLabel: 'Elimina', danger: true })) { await db.routines.delete(Number(id)); await db.routineLogs.where('routineId').equals(Number(id)).delete(); refresh(); } },
    template: async ({ k }) => { const t = TEMPLATES[k]; await db.routines.add({ name: t.name, emoji: t.emoji, time: t.time, days: ALL_DAYS, remind: true, active: true, createdAt: Date.now(), items: t.items.map((text) => ({ id: uid(), text })) }); toast(`${t.name} aggiunta`); refresh(); },
    habit: async ({ id }) => { await tapHabit(Number(id)); refresh(); },
    addHabit: async () => { if (await habitForm()) refresh(); },
    editHabit: async ({ id }) => { if (await habitForm(await db.habits.get(Number(id)))) refresh(); },
    addGoal: async () => { if (await goalForm()) refresh(); },
    editGoal: async ({ id }) => { if (await goalForm(await db.goals.get(Number(id)))) refresh(); },
    milestone: async ({ g, m }) => {
      const goal = await db.goals.get(Number(g));
      goal.milestones = goal.milestones.map((x) => (x.id === m ? { ...x, done: !x.done, doneAt: !x.done ? today() : null } : x));
      goal.progress = goalProgress(goal);
      if (goal.progress >= 1 && goal.status !== 'done') { toast('Tutti i traguardi completati! Segna l’obiettivo come raggiunto?', { ms: 5000, action: { label: 'Sì', run: async () => { await db.goals.update(goal.id, { status: 'done', doneAt: today() }); refresh(); } } }); }
      await db.goals.put(goal); haptic(); refresh();
    },
    review: async () => { if (await weeklyReview()) refresh(); },
    editDay: async ({ day }) => {
      const d = day != null ? Number(day) : weekdayIdx(new Date());
      const row = await db.schedule.get(d);
      const r = await formSheet({ title: cap(WD_LONG[d]), values: { text: row?.text || '' }, fields: [{ name: 'text', label: 'Una riga per attività', type: 'textarea', rows: 12, placeholder: '07:00-07:30 Colazione\n08:00 Lavoro\n13:00-14:00 Pranzo e passeggiata' }] });
      if (r) { await db.schedule.put({ weekday: d, text: r.text }); refresh(); }
    },
    copyDay: async () => {
      const from = await actionSheet('Copia da', WD_LONG.map((n, i) => ({ label: cap(n), value: i })));
      if (from == null) return;
      const to = await formSheet({ title: 'Copia su', fields: [{ name: 'days', label: 'Giorni', type: 'chips', options: WD.map((w, i) => ({ value: i, label: w })) }], submitLabel: 'Copia' });
      if (!to) return;
      const src = await db.schedule.get(from);
      for (const d of to.days) if (d !== from) await db.schedule.put({ weekday: d, text: src?.text || '' });
      toast('Schedule copiata'); refresh();
    }
  });
}

// ---------- Form ----------
async function routineForm(r = null) {
  const v = r ? { ...r, itemsText: (r.items || []).map((i) => (i.time ? `${i.time} ${i.text}` : i.text)).join('\n') } : { emoji: '✅', days: ALL_DAYS, remind: true, active: true };
  const res = await formSheet({
    title: r ? 'Modifica routine' : 'Nuova routine', values: v, deleteLabel: r ? 'Elimina routine' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !r, placeholder: 'es. Mattina' },
      { name: 'emoji', label: 'Emoji' },
      { name: 'time', label: 'Orario', type: 'time' },
      { name: 'days', label: 'Giorni', type: 'chips', options: WD.map((w, i) => ({ value: i, label: w })), group: 1 },
      { name: 'itemsText', label: 'Checklist (una per riga, orario opzionale “07:10 Doccia”)', type: 'textarea', rows: 7, required: true, group: 2 },
      { name: 'remind', label: 'Promemoria', type: 'checkbox', group: 3 },
      { name: 'active', label: 'Attiva', type: 'checkbox', group: 3 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.routines.delete(r.id); await db.routineLogs.where('routineId').equals(r.id).delete(); return true; }
  const old = r?.items || [];
  const items = res.itemsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
    const text = m ? m[2] : l, time = m ? m[1].replace('.', ':').padStart(5, '0') : '';
    const prev = old.find((o) => o.text === text);
    return { id: prev?.id || uid(), text, time };
  });
  const { itemsText, ...rest } = res;
  await db.routines.put({ ...(r || { createdAt: Date.now() }), ...rest, days: res.days.length ? res.days : ALL_DAYS, items });
  return true;
}

async function habitForm(h = null) {
  const goals = await db.goals.filter((g) => g.status !== 'done').toArray();
  const res = await formSheet({
    title: h ? 'Modifica abitudine' : 'Nuova abitudine', values: h || { emoji: '🔁', days: ALL_DAYS, target: 1, active: true }, deleteLabel: h ? 'Elimina abitudine' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !h, placeholder: 'es. Leggere 10 pagine' },
      { name: 'emoji', label: 'Emoji' },
      { name: 'target', label: 'Volte al giorno', type: 'number', min: 1, step: 1 },
      { name: 'goalId', label: 'Collegata all’obiettivo', type: 'select', options: [{ value: '', label: 'Nessuno' }, ...goals.map((g) => ({ value: g.id, label: g.title }))] },
      { name: 'days', label: 'Giorni', type: 'chips', options: WD.map((w, i) => ({ value: i, label: w })), group: 1 },
      { name: 'remindTime', label: 'Promemoria alle', type: 'time', group: 2 },
      { name: 'active', label: 'Attiva', type: 'checkbox', group: 2 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.habits.delete(h.id); await db.habitLogs.where('habitId').equals(h.id).delete(); return true; }
  await db.habits.put({ ...(h || { createdAt: Date.now() }), ...res, goalId: res.goalId || null, target: Math.max(1, res.target || 1), days: res.days.length ? res.days : ALL_DAYS });
  return true;
}

async function goalForm(g = null) {
  const v = g ? { ...g, msText: (g.milestones || []).map((m) => (m.due ? `${m.text} | ${m.due}` : m.text)).join('\n'), manualPct: Math.round((g.manualProgress || 0) * 100) } : { category: 'personale', status: 'active', progressMode: 'milestones' };
  const res = await formSheet({
    title: g ? 'Modifica obiettivo' : 'Nuovo obiettivo', values: v, deleteLabel: g ? 'Elimina obiettivo' : null,
    fields: [
      { name: 'title', label: 'Obiettivo', required: true, autofocus: !g, placeholder: 'es. Correre 10 km' },
      { name: 'category', label: 'Area', type: 'select', options: Object.entries(GOAL_CATS).map(([k, [e, l]]) => ({ value: k, label: `${e} ${l}` })) },
      { name: 'deadline', label: 'Scadenza', type: 'date' },
      { name: 'status', label: 'Stato', type: 'select', options: [{ value: 'active', label: 'In corso' }, { value: 'paused', label: 'In pausa' }, { value: 'done', label: 'Completato' }] },
      { name: 'why', label: 'Perché è importante', type: 'textarea', rows: 2, group: 1 },
      { name: 'progressMode', label: 'Avanzamento', type: 'select', options: [{ value: 'milestones', label: 'Dai traguardi' }, { value: 'manual', label: 'Manuale' }], group: 2 },
      { name: 'manualPct', label: 'Percentuale', type: 'number', min: 0, max: 100, step: 5, showIf: (x) => x.progressMode === 'manual', group: 2 },
      { name: 'msText', label: 'Traguardi (uno per riga, scadenza opzionale “Testo | 2026-12-31”)', type: 'textarea', rows: 6, showIf: (x) => x.progressMode === 'milestones', group: 2 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.goals.delete(g.id); await db.habits.where('goalId').equals(g.id).modify({ goalId: null }); return true; }
  const old = g?.milestones || [];
  const milestones = (res.msText || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [text, due] = l.split('|').map((s) => s.trim());
    const prev = old.find((o) => o.text === text);
    return { id: prev?.id || uid(), text, due: /^\d{4}-\d{2}-\d{2}$/.test(due || '') ? due : prev?.due || '', done: prev?.done || false, doneAt: prev?.doneAt || null };
  });
  const { msText, manualPct, ...rest } = res;
  const goal = { ...(g || { createdAt: Date.now() }), ...rest, milestones, manualProgress: (manualPct || 0) / 100 };
  if (rest.status === 'done' && !goal.doneAt) goal.doneAt = today();
  goal.progress = goalProgress(goal);
  await db.goals.put(goal);
  return true;
}

/** Revisione settimanale guidata: salva le risposte nel diario e aggiorna gli obiettivi */
export async function weeklyReview() {
  const goals = await db.goals.filter((g) => (g.status || 'active') === 'active').toArray();
  const fields = [
    { name: 'good', label: 'Cosa è andato bene questa settimana?', type: 'textarea', rows: 3, autofocus: true },
    { name: 'hard', label: 'Cosa è stato difficile? Cosa ho imparato?', type: 'textarea', rows: 3 },
    { name: 'focus', label: 'Le 3 priorità della prossima settimana', type: 'textarea', rows: 3 },
    ...goals.filter((g) => g.progressMode === 'manual' || !(g.milestones || []).length).map((g) => ({ name: `g${g.id}`, label: `${g.title} – avanzamento %`, type: 'number', min: 0, max: 100, step: 5, value: Math.round(goalProgress(g) * 100), group: 1 }))
  ];
  const r = await formSheet({ title: 'Revisione settimanale', fields, submitLabel: 'Salva' });
  if (!r) return false;
  for (const g of goals) if (r[`g${g.id}`] != null) await db.goals.update(g.id, { progressMode: 'manual', manualProgress: r[`g${g.id}`] / 100, progress: r[`g${g.id}`] / 100 });
  const text = `Cosa è andato bene:\n${r.good || '–'}\n\nDifficoltà e lezioni:\n${r.hard || '–'}\n\nPriorità della prossima settimana:\n${r.focus || '–'}`;
  await db.journal.add({ date: today(), title: `Revisione settimana ${fmtDate(ymd(addDays(new Date(), -6)), { day: 'numeric', month: 'short' })} – ${fmtDate(today(), { day: 'numeric', month: 'short' })}`, text, tags: ['revisione'], createdAt: Date.now() });
  toast('Revisione salvata nel diario');
  return true;
}
