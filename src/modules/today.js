// Home "Oggi": riepilogo e azioni rapide da tutti i moduli
import { db, settings, lookups } from '../core/db.js';
import { html, raw, icon, bindActions, pageHeader, iconBtn, progress, toast, actionSheet, haptic } from '../core/ui.js';
import { today, fmtDay, money, pct, fmtTime, relDay, ymd, addDays, thisMonth } from '../core/format.js';
import { monthStats, budgetStatus } from '../lib/finance.js';
import { getOccurrences } from '../core/agenda.js';
import { routinesForDay, toggleRoutineItem, habitsForDay, tapHabit, nowNext, goalProgress, GOAL_CATS } from './routines.js';
import { quoteOfDay, toggleFav, medOfDay, playMeditation, setMood, MOODS, meditationStats } from './mind.js';
import { medDuration } from '../data/meditations.js';
import { addWater, getValue } from './health.js';
import { backupDue } from '../core/backup.js';
import { isStandalone, isIOS } from '../core/storage.js';
import { postRecurringNow } from '../core/money.js';
import { go } from '../core/router.js';

const greeting = () => { const h = new Date().getHours(); return h < 6 ? 'Buona notte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };

export async function render(root, route, ctx) {
  const t = today();
  const now = new Date();
  const [q, nn, occ, routines, habits, txs, budgets, L, goals, mood, water, med, recurring] = await Promise.all([
    quoteOfDay(), nowNext(), getOccurrences(now, addDays(now, 7)), routinesForDay(), habitsForDay(), db.transactions.where('date').startsWith(thisMonth()).toArray(),
    db.budgets.toArray(), lookups(), db.goals.filter((g) => (g.status || 'active') === 'active').toArray(), db.moods.get(t), getValue('water'), meditationStats(),
    db.recurring.filter((r) => r.active !== false && !r.autoPost && r.nextDate && r.nextDate <= t).toArray()
  ]);
  const st = monthStats(txs, thisMonth(), t);
  const alerts = budgetStatus(budgets, txs, L.categories, thisMonth()).filter((b) => b.level !== 'ok');
  const upcoming = occ.filter((o) => o.end >= now).slice(0, 6);
  const openRoutines = routines.filter((r) => r.doneCount < r.items.length);
  const doneRoutines = routines.length - openRoutines.length;
  const m = medOfDay();
  const topGoals = goals.map((g) => ({ ...g, p: goalProgress(g) })).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9')).slice(0, 3);

  root.innerHTML = String(html`${pageHeader('Oggi', { right: html`${iconBtn('search', 'search', 'Cerca')}${iconBtn('plus', 'quick', 'Aggiungi')}` })}
  <main class="page">
    <p class="muted" style="margin:-4px 0 12px;font-weight:600">${greeting()} · ${fmtDay(now)}</p>
    ${!isStandalone() && isIOS() ? html`<div class="banner warn"><span>📲</span><p><b>Installa l’app prima di inserire dati.</b> In Safari tocca Condividi → Aggiungi alla schermata Home, poi apri Vita dall’icona.</p></div>` : ''}
    ${backupDue() ? html`<a class="banner" href="#/impostazioni/backup"><span>💾</span><p>${settings.lastBackup ? `Ultimo backup ${relDay(settings.lastBackup.slice(0, 10)).toLowerCase()}.` : 'Nessun backup ancora.'} Tocca per salvarlo su iCloud Drive.</p></a>` : ''}
    ${recurring.length ? html`<div class="card" style="margin-bottom:12px"><h3>⏰ Da registrare</h3><div class="list">${recurring.map((r) => html`<div class="row"><span class="row-main"><strong>${r.title}</strong><small>${relDay(r.nextDate)} · ${money(r.amount)}</small></span><button class="btn small filled" data-act="postRec" data-id="${r.id}">Registra</button></div>`)}</div></div>` : ''}

    <div class="quick">
      <button data-act="addExpense"><span>💸</span><span>Spesa</span></button>
      <button data-act="addIncome"><span>💰</span><span>Entrata</span></button>
      <button data-act="addEvent"><span>📅</span><span>Evento</span></button>
      <button data-act="addNote"><span>🗒️</span><span>Nota</span></button>
    </div>

    <div class="card" style="margin-top:14px"><h3>Frase del giorno <button class="icon-btn" data-act="fav" data-key="${q.key}" aria-label="${q.fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}" style="color:${q.fav ? 'var(--red)' : 'var(--text3)'};width:36px;height:36px">${raw(String(icon('heart')).replace('fill="none"', `fill="${q.fav ? 'currentColor' : 'none'}"`))}</button></h3>
      <div class="quote">${q.text}</div>${q.author ? html`<div class="quote-author">${q.author}</div>` : ''}</div>

    ${nn.items.length ? html`<div class="card now-next"><div class="now"><div class="muted small">Cosa devo fare adesso</div><strong>${nn.now ? nn.now.text : 'Tempo libero'}</strong>${nn.now ? html`<div class="muted small">fino alle ${nn.now.end}</div>` : ''}</div>
      <div class="next"><div class="muted small">Prossimo</div><strong>${nn.next ? nn.next.text : 'Fine della giornata'}</strong>${nn.next ? html`<div class="muted small">alle ${nn.next.start}</div>` : ''}</div></div>` : ''}

    <h2 class="section-title">Prossimi appuntamenti <a href="#/calendario/agenda">Agenda</a></h2>
    ${upcoming.length ? html`<div class="list">${upcoming.map((o) => html`<a class="row ev-row" href="#/calendario/agenda"><span class="t">${o.allDay ? relDay(ymd(o.start)) : html`${relDay(ymd(o.start)) === 'Oggi' ? '' : relDay(ymd(o.start)).slice(0, 3) + ' '}${fmtTime(o.start)}`}</span><span class="bar" style="background:${o.color}"></span><span class="row-main"><strong>${o.title}</strong><small>${[o.cal.name, o.ev?.location].filter(Boolean).join(' · ')}</small></span></a>`)}</div>` : html`<div class="card muted">Niente in programma nei prossimi 7 giorni.</div>`}

    <h2 class="section-title">Routine <span class="muted small">${doneRoutines}/${routines.length} completate</span></h2>
    ${openRoutines.length ? openRoutines.slice(0, 3).map((r) => html`<div class="card" style="margin-bottom:10px"><h3><span>${r.emoji || '✅'} ${r.name}</span><span>${r.doneCount}/${r.items.length}</span></h3>${progress(r.doneCount / r.items.length)}
      <div class="list" style="margin-top:8px">${r.items.filter((i) => !i.done).slice(0, 4).map((i) => html`<button class="row" data-act="routineItem" data-r="${r.id}" data-i="${i.id}" role="checkbox" aria-checked="false"><span class="check"></span><span class="row-main"><strong>${i.text}</strong></span>${i.time ? html`<span class="row-end">${i.time}</span>` : ''}</button>`)}</div></div>`)
      : html`<div class="card">${routines.length ? '🎉 Tutte le routine di oggi sono completate.' : html`<a href="#/routine">Crea la tua prima routine</a>`}</div>`}
    ${habits.length ? html`<div class="chips" style="margin-top:6px">${habits.map((h) => html`<button class="chip ${h.done ? 'on' : ''}" data-act="habit" data-id="${h.id}" aria-pressed="${h.done}">${h.emoji || '🔁'} ${h.name}${h.target > 1 ? ` ${h.count}/${h.target}` : ''}</button>`)}</div>` : ''}

    <h2 class="section-title">Saldo del mese <a href="#/finanze">Finanze</a></h2>
    <div class="card"><div class="grid2"><div class="stat"><div class="l">Entrate</div><div class="v pos">${money(st.income)}</div></div><div class="stat"><div class="l">Uscite</div><div class="v">${money(st.expense)}</div></div>
      <div class="stat"><div class="l">Saldo</div><div class="v ${st.net >= 0 ? 'pos' : 'neg'}">${money(st.net)}</div></div><div class="stat"><div class="l">Previsione uscite</div><div class="v">${money(st.forecastExpense)}</div></div></div>
      ${alerts.length ? html`<a class="banner warn" href="#/finanze/budget" style="margin-bottom:0"><span>⚠️</span><p>${alerts.map((a) => `${a.category?.name}: ${Math.round(a.pct * 100)}%`).join(' · ')}</p></a>` : ''}</div>

    ${topGoals.length ? html`<h2 class="section-title">Obiettivi in corso <a href="#/routine/obiettivi">Tutti</a></h2><div class="card">${topGoals.map((g) => html`<div class="kv"><span>${GOAL_CATS[g.category]?.[0] || '🎯'} ${g.title}</span><span class="muted">${pct(g.p)}</span></div>${progress(g.p, g.p >= 1 ? 'good' : '')}`)}</div>` : ''}

    <h2 class="section-title">Meditazione del giorno <a href="#/mente">Tutte</a></h2>
    <button class="card row has-ic" style="border-radius:var(--radius-lg)" data-act="meditate"><span class="row-ic" style="font-size:1.5em;width:48px;height:48px">${m.emoji}</span><span class="row-main wrap"><strong>${m.title}${med.doneToday ? ' ✓' : ''}</strong><small>${Math.round(medDuration(m) / 60)} min · 🔥 ${med.streak} giorni di fila</small></span>${icon('play')}</button>

    <h2 class="section-title">Come stai?</h2>
    <div class="card"><div class="mood-row" role="radiogroup" aria-label="Umore di oggi">${MOODS.map((e, i) => html`<button class="${mood?.value === i + 1 ? 'on' : ''}" data-act="mood" data-v="${i + 1}" role="radio" aria-checked="${mood?.value === i + 1}" aria-label="Umore ${i + 1} su 5">${e}</button>`)}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn small" data-act="water">💧 Acqua ${water || 0}/${settings.waterTarget}</button><button class="btn small" data-act="gratitude">🙏 Gratitudine</button><button class="btn small" data-act="journal">📔 Diario</button></div></div>
  </main>`);

  const refresh = () => ctx.rerender();
  const wrap = (fn) => async () => { if (await fn()) refresh(); };
  const handlers = {
    addExpense: wrap(async () => (await import('./finance.js')).openTxForm(null, { type: 'expense' })),
    addIncome: wrap(async () => (await import('./finance.js')).openTxForm(null, { type: 'income' })),
    addTransfer: wrap(async () => (await import('./finance.js')).openTxForm(null, { type: 'transfer' })),
    addEvent: wrap(async () => (await import('./calendar.js')).openEventForm()),
    addNote: wrap(async () => (await import('./notes.js')).openNoteForm()),
    journal: wrap(async () => (await import('./journal.js')).openJournalForm()),
    gratitude: wrap(async () => (await import('./mind.js')).addGratitude())
  };
  return bindActions(root, {
    search: () => go('#/cerca'),
    quick: async () => {
      const c = await actionSheet('Aggiungi', [
        { label: 'Spesa', value: 'addExpense', icon: '💸' }, { label: 'Entrata', value: 'addIncome', icon: '💰' }, { label: 'Trasferimento', value: 'addTransfer', icon: '🔁' },
        { label: 'Evento', value: 'addEvent', icon: '📅' }, { label: 'Nota', value: 'addNote', icon: '🗒️' }, { label: 'Voce di diario', value: 'journal', icon: '📔' }, { label: 'Gratitudine', value: 'gratitude', icon: '🙏' }
      ]);
      if (c) await handlers[c]();
    },
    ...handlers,
    postRec: async ({ id }) => { await postRecurringNow(await db.recurring.get(Number(id))); toast('Registrato'); refresh(); },
    fav: async ({ key }) => { await toggleFav(key); refresh(); },
    routineItem: async ({ r, i }) => { await toggleRoutineItem(Number(r), i); refresh(); },
    habit: async ({ id }) => { await tapHabit(Number(id)); refresh(); },
    meditate: () => playMeditation(m).then(refresh),
    mood: async ({ v }) => { await setMood(Number(v)); toast(`Umore registrato ${MOODS[v - 1]}`); refresh(); },
    water: async () => { const v = await addWater(1); if (v === settings.waterTarget) toast('Obiettivo acqua raggiunto 💧'); refresh(); }
  });


}
