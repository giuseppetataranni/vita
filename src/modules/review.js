// Revisione automatica settimanale e mensile
import { db, lookups } from '../core/db.js';
import { html, raw, bindActions, pageHeader, segmented, iconBtn, toast } from '../core/ui.js';
import { ymd, addDays, startOfWeek, money, pct, num, fmtDate, MONTHS, cap, weekdayIdx, parseYmd } from '../core/format.js';
import { summarize, byCategory } from '../lib/finance.js';
import { routineRatioFn, weeklyReview } from './routines.js';
import { MOODS } from './mind.js';
import { getOccurrences } from '../core/agenda.js';

const state = { mode: 'settimana', offset: 0 };

function period() {
  const now = new Date();
  if (state.mode === 'settimana') {
    const s = addDays(startOfWeek(now), 7 * state.offset);
    return { from: s, to: addDays(s, 6), label: `${fmtDate(ymd(s), { day: 'numeric', month: 'short' })} – ${fmtDate(ymd(addDays(s, 6)), { day: 'numeric', month: 'short', year: 'numeric' })}` };
  }
  const s = new Date(now.getFullYear(), now.getMonth() + state.offset, 1);
  return { from: s, to: new Date(s.getFullYear(), s.getMonth() + 1, 0), label: `${cap(MONTHS[s.getMonth()])} ${s.getFullYear()}` };
}

async function compute(from, to) {
  const F = ymd(from), T = ymd(to);
  const len = Math.round((to - from) / 86400000) + 1;
  const prevF = ymd(addDays(from, -len)), prevT = ymd(addDays(from, -1));
  const inR = (d, a = F, b = T) => d >= a && d <= b;
  const { categories } = await lookups();
  const [txs, moods, meds, health, habits, hlogs, goals, grat, journal] = await Promise.all([
    db.transactions.toArray(), db.moods.toArray(), db.meditations.toArray(), db.health.toArray(), db.habits.toArray(), db.habitLogs.toArray(), db.goals.toArray(), db.gratitude.toArray(), db.journal.toArray()
  ]);
  const cur = txs.filter((t) => inR(t.date)), prev = txs.filter((t) => inR(t.date, prevF, prevT));
  const fin = summarize(cur), finPrev = summarize(prev);
  const top = byCategory(cur, categories).slice(0, 3);
  const ratio = await routineRatioFn(Math.max(40, Math.round((Date.now() - from) / 86400000) + 2));
  const days = Array.from({ length: len }, (_, i) => addDays(from, i)).filter((d) => d <= new Date());
  const rr = days.map(ratio).filter((x) => x != null);
  let hSched = 0, hDone = 0;
  const hl = new Map(hlogs.map((l) => [`${l.habitId}:${l.date}`, l.count || 1]));
  for (const d of days) for (const h of habits.filter((x) => x.active !== false && (x.days || [0, 1, 2, 3, 4, 5, 6]).includes(weekdayIdx(d)))) { hSched++; if ((hl.get(`${h.id}:${ymd(d)}`) || 0) >= (h.target || 1)) hDone++; }
  const ms = goals.flatMap((g) => (g.milestones || []).filter((m) => m.done && m.doneAt && inR(m.doneAt)).map((m) => `${g.title}: ${m.text}`));
  const goalsDone = goals.filter((g) => g.doneAt && inR(g.doneAt)).map((g) => g.title);
  const md = moods.filter((m) => inR(m.date));
  const moodAvg = md.length ? md.reduce((a, m) => a + m.value, 0) / md.length : null;
  const best = md.slice().sort((a, b) => b.value - a.value)[0];
  const medMin = meds.filter((m) => inR(m.date)).reduce((a, m) => a + (m.minutes || 0), 0);
  const medSessions = meds.filter((m) => inR(m.date)).length;
  const hv = (type) => health.filter((h) => h.type === type && inR(h.date));
  const avgOf = (arr) => (arr.length ? arr.reduce((a, h) => a + h.value, 0) / arr.length : null);
  const w = hv('weight').sort((a, b) => a.date.localeCompare(b.date));
  const occ = await getOccurrences(from, new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59));
  return {
    fin, finPrev, top, routine: rr.length ? rr.reduce((a, b) => a + b, 0) / rr.length : null, habits: hSched ? hDone / hSched : null, hDone, hSched, ms, goalsDone,
    moodAvg, moodDays: md.length, best, medMin, medSessions, sleep: avgOf(hv('sleep')), water: avgOf(hv('water')), workout: hv('workout').reduce((a, h) => a + h.value, 0),
    weightDelta: w.length > 1 ? w[w.length - 1].value - w[0].value : null, grat: grat.filter((g) => inR(g.date)).length, journal: journal.filter((j) => inR(j.date)).length,
    events: occ.filter((o) => !o.virtual).length
  };
}

function summaryText(r, label) {
  return [`Revisione ${label}`, '',
    `Finanze: entrate ${money(r.fin.income)}, uscite ${money(r.fin.expense)}, risparmio ${money(r.fin.net)}`,
    r.top.length ? `Top spese: ${r.top.map((c) => `${c.category.name} ${money(c.value)}`).join(', ')}` : '',
    r.routine != null ? `Routine completate: ${pct(r.routine)}` : '', r.habits != null ? `Abitudini: ${r.hDone}/${r.hSched}` : '',
    r.ms.length ? `Traguardi: ${r.ms.join('; ')}` : '', r.moodAvg != null ? `Umore medio: ${num(r.moodAvg, 1)}/5` : '',
    `Meditazione: ${num(r.medMin)} minuti in ${r.medSessions} sessioni`].filter(Boolean).join('\n');
}

export async function render(root, route, ctx) {
  const p = period();
  const r = await compute(p.from, p.to);
  const delta = r.finPrev.expense ? (r.fin.expense - r.finPrev.expense) / r.finPrev.expense : null;
  root.innerHTML = String(html`${pageHeader('Revisione', { back: { href: '#/altro', label: 'Altro' }, right: iconBtn('share', 'share', 'Condividi riepilogo') })}<main class="page">
  <div class="seg-wrap">${segmented([{ value: 'settimana', label: 'Settimana' }, { value: 'mese', label: 'Mese' }], state.mode, 'mode')}</div>
  <div class="cal-head">${iconBtn('left', 'prev', 'Periodo precedente')}<h2>${p.label}</h2>${iconBtn('right', 'next', 'Periodo successivo')}</div>
  <div class="card"><h3>💶 Finanze</h3><div class="grid2"><div class="stat"><div class="l">Entrate</div><div class="v pos">${money(r.fin.income)}</div></div><div class="stat"><div class="l">Uscite</div><div class="v">${money(r.fin.expense)}</div></div><div class="stat"><div class="l">Risparmio</div><div class="v ${r.fin.net >= 0 ? 'pos' : 'neg'}">${money(r.fin.net)}</div></div><div class="stat"><div class="l">Uscite vs periodo prima</div><div class="v">${delta == null ? '–' : `${delta > 0 ? '+' : ''}${pct(delta)}`}</div></div></div>
    ${r.top.length ? html`<p class="small" style="margin:10px 0 0">Spese principali: ${r.top.map((c) => `${c.category.icon || ''} ${c.category.name} ${money(c.value)}`).join(' · ')}</p>` : ''}</div>
  <div class="card"><h3>✅ Routine e abitudini</h3><div class="grid2"><div class="stat"><div class="l">Routine completate</div><div class="v">${r.routine == null ? '–' : pct(r.routine)}</div></div><div class="stat"><div class="l">Abitudini</div><div class="v">${r.hSched ? `${r.hDone}/${r.hSched}` : '–'}</div></div></div></div>
  <div class="card"><h3>🎯 Obiettivi</h3>${r.ms.length || r.goalsDone.length ? html`${r.goalsDone.map((g) => html`<p style="margin:4px 0">🏆 Raggiunto: <b>${g}</b></p>`)}${r.ms.map((m) => html`<p style="margin:4px 0">🏁 ${m}</p>`)}` : html`<p class="muted" style="margin:0">Nessun traguardo completato in questo periodo.</p>`}</div>
  <div class="card"><h3>🧘 Benessere</h3><div class="grid2">
    <div class="stat"><div class="l">Umore medio</div><div class="v">${r.moodAvg == null ? '–' : `${MOODS[Math.round(r.moodAvg) - 1]} ${num(r.moodAvg, 1)}`}</div></div>
    <div class="stat"><div class="l">Meditazione</div><div class="v">${num(r.medMin)} min</div></div>
    <div class="stat"><div class="l">Sonno medio</div><div class="v">${r.sleep == null ? '–' : num(r.sleep, 1) + ' h'}</div></div>
    <div class="stat"><div class="l">Allenamento</div><div class="v">${num(r.workout)} min</div></div>
    <div class="stat"><div class="l">Acqua media</div><div class="v">${r.water == null ? '–' : num(r.water, 1)}</div></div>
    <div class="stat"><div class="l">Peso</div><div class="v">${r.weightDelta == null ? '–' : `${r.weightDelta > 0 ? '+' : ''}${num(r.weightDelta, 1)} kg`}</div></div></div>
    ${r.best ? html`<p class="small" style="margin:10px 0 0">Giorno migliore: ${fmtDate(r.best.date, { weekday: 'long', day: 'numeric', month: 'short' })} ${MOODS[r.best.value - 1]}${r.best.note ? ` – “${r.best.note}”` : ''}</p>` : ''}</div>
  <div class="card"><h3>📝 Attività</h3><p style="margin:0">${r.events} eventi · ${r.journal} voci di diario · ${r.grat} gratitudini</p></div>
  <button class="btn filled block" data-act="guided">📝 Fai la revisione guidata</button></main>`);
  const refresh = () => ctx.rerender();
  return bindActions(root, {
    mode: ({ value }) => { state.mode = value; state.offset = 0; refresh(); },
    prev: () => { state.offset--; refresh(); },
    next: () => { if (state.offset < 0) { state.offset++; refresh(); } else toast('Sei già al periodo corrente'); },
    guided: async () => { await weeklyReview(); },
    share: async () => { const text = summaryText(r, p.label); if (navigator.share) navigator.share({ text }).catch(() => {}); else { await navigator.clipboard?.writeText(text); toast('Riepilogo copiato'); } }
  });
}
