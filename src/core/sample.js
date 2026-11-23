// Dati di esempio per provare l'app (tutti marcati sample:true e rimovibili)
import { db, lookups } from './db.js';
import { ymd, addDays, today, uid, pad, weekdayIdx } from './format.js';
import { nextDate } from '../lib/finance.js';

let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const amt = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
const S = { sample: true };

export async function loadSample() {
  seed = 42;
  const { accounts, categories } = await lookups();
  const cat = (name) => categories.find((c) => c.name === name)?.id || null;
  const acc = (type) => accounts.find((a) => a.type === type)?.id || accounts[0].id;
  const card = acc('conto'), cash = acc('contanti'), save = acc('risparmio');
  const now = new Date();
  const tx = [];
  const add = (date, type, amount, categoryId, description, extra = {}) => tx.push({ date: ymd(date), type, amount, categoryId, description, accountId: extra.accountId || card, tags: extra.tags || [], note: '', createdAt: Date.now(), ...extra, ...S });
  for (let i = 95; i >= 0; i--) {
    const d = addDays(now, -i);
    const dom = d.getDate(), wd = weekdayIdx(d);
    if (dom === 1) { add(d, 'income', 1850, cat('Stipendio'), 'Stipendio', { fixed: true }); add(d, 'transfer', 200, null, 'Risparmio mensile', { toAccountId: save }); }
    if (dom === 2) add(d, 'expense', 650, cat('Affitto/Mutuo'), 'Affitto', { fixed: true });
    if (dom === 10) add(d, 'expense', amt(70, 110), cat('Bollette'), 'Luce e gas', { fixed: true });
    if (dom === 15) add(d, 'expense', 12.99, cat('Streaming'), 'Netflix', { fixed: true, tags: ['abbonamento'] });
    if (dom === 5) add(d, 'expense', 39, cat('Svago'), 'Palestra', { fixed: true, tags: ['abbonamento'] });
    if ([0, 2, 5].includes(wd)) add(d, 'expense', amt(18, 75), cat('Supermercato'), pick(['Esselunga', 'Conad', 'Coop', 'Lidl']));
    if (rnd() < 0.55) add(d, 'expense', amt(1.2, 4.5), cat('Bar e caffè'), 'Caffè', { accountId: cash });
    if (wd === 5 && rnd() < 0.8) add(d, 'expense', amt(25, 60), cat('Ristorante'), pick(['Pizzeria', 'Sushi', 'Trattoria']), { tags: ['amici'] });
    if (wd === 6 && rnd() < 0.4) add(d, 'expense', amt(15, 80), cat('Uscite'), pick(['Cinema', 'Mostra', 'Concerto']));
    if (dom % 14 === 3) add(d, 'expense', amt(35, 55), cat('Carburante'), 'Benzina');
    if (rnd() < 0.06) add(d, 'expense', amt(20, 120), cat('Abbigliamento'), pick(['Scarpe', 'Maglione', 'Giacca']));
    if (rnd() < 0.05) add(d, 'expense', amt(8, 30), cat('Farmacia'), 'Farmacia');
    if (dom === 20 && i < 40) add(d, 'income', amt(150, 400), cat('Extra e freelance'), 'Progetto freelance');
  }
  await db.transaction('rw', db.tables, async () => {
    await db.accounts.update(save, { initial: 1200 });
    await db.accounts.update(card, { initial: 2400 });
    await db.accounts.update(cash, { initial: 250 });
    await db.transactions.bulkAdd(tx);
    for (const [name, amount] of [['Spesa alimentare', 380], ['Ristoranti e bar', 160], ['Svago', 140], ['Shopping', 120]]) {
      const id = cat(name);
      if (id && !(await db.budgets.where('categoryId').equals(id).count())) await db.budgets.add({ categoryId: id, amount, ...S });
    }
    const nd = (day) => { let d = ymd(new Date(now.getFullYear(), now.getMonth(), day)); if (d <= today()) d = nextDate(d, 'monthly'); return d; };
    await db.recurring.bulkAdd([
      { title: 'Affitto', type: 'expense', amount: 650, categoryId: cat('Affitto/Mutuo'), accountId: card, freq: 'monthly', interval: 1, nextDate: nd(2), autoPost: false, remindDaysBefore: 2, active: true, ...S },
      { title: 'Netflix', type: 'expense', amount: 12.99, categoryId: cat('Streaming'), accountId: card, freq: 'monthly', interval: 1, nextDate: nd(15), autoPost: false, isSubscription: true, remindDaysBefore: 1, active: true, ...S },
      { title: 'Palestra', type: 'expense', amount: 39, categoryId: cat('Svago'), accountId: card, freq: 'monthly', interval: 1, nextDate: nd(5), autoPost: false, isSubscription: true, remindDaysBefore: 1, active: true, ...S },
      { title: 'Assicurazione auto', type: 'expense', amount: 420, categoryId: cat('Auto'), accountId: card, freq: 'yearly', interval: 1, nextDate: ymd(addDays(now, 45)), remindDaysBefore: 7, active: true, ...S }
    ]);
    await db.savings.bulkAdd([
      { name: 'Vacanza estiva', icon: '🏖️', target: 2500, targetDate: ymd(new Date(now.getFullYear() + 1, 5, 30)), accountId: save, ...S },
      { name: 'Nuovo portatile', icon: '💻', target: 1200, targetDate: ymd(addDays(now, 240)), accountId: null, saved: 350, ...S }
    ]);
    await db.debts.bulkAdd([
      { person: 'Marco', direction: 'owed', amount: 25, dueDate: ymd(addDays(now, 5)), note: 'Cena', settled: false, ...S },
      { person: 'Giulia', direction: 'owe', amount: 40, dueDate: ymd(addDays(now, 10)), note: 'Biglietti concerto', settled: false, ...S }
    ]);
    const cals = await db.calendars.toArray();
    const pers = cals.find((c) => c.name === 'Personale')?.id || cals[0].id, work = cals.find((c) => c.name === 'Lavoro')?.id || pers;
    const at = (days, h, m = 0) => { const d = addDays(now, days); return `${ymd(d)}T${pad(h)}:${pad(m)}`; };
    const mon = addDays(now, -weekdayIdx(now));
    await db.events.bulkAdd([
      { calendarId: pers, uid: uid(), title: 'Palestra', start: `${ymd(mon)}T18:30`, end: `${ymd(mon)}T19:45`, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', exdates: [], alarm: 30, location: 'FitClub', ...S },
      { calendarId: work, uid: uid(), title: 'Riunione di team', start: `${ymd(addDays(mon, 1))}T10:00`, end: `${ymd(addDays(mon, 1))}T11:00`, rrule: 'FREQ=WEEKLY', exdates: [], alarm: 10, location: 'Sala riunioni', ...S },
      { calendarId: pers, uid: uid(), title: 'Dentista', start: at(3, 9, 30), end: at(3, 10, 15), alarm: 60, location: 'Studio dentistico', notes: 'Portare la tessera sanitaria', exdates: [], ...S },
      { calendarId: pers, uid: uid(), title: 'Cena con amici', start: at(4, 20, 30), end: at(4, 23, 0), alarm: 120, exdates: [], ...S },
      { calendarId: work, uid: uid(), title: 'Consegna progetto', start: at(9, 0), end: at(9, 23, 59), allDay: true, alarm: 1440, exdates: [], ...S },
      { calendarId: pers, uid: uid(), title: 'Compleanno mamma', start: at(12, 0), end: at(12, 23, 59), allDay: true, rrule: 'FREQ=YEARLY', alarm: 1440, exdates: [], ...S }
    ]);
    const r1 = await db.routines.add({ name: 'Routine del mattino', emoji: '🌅', time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], remind: true, active: true, createdAt: +addDays(now, -60), items: ['Bicchiere d’acqua', 'Letto rifatto', '5 minuti di respiro', 'Colazione', 'Tre priorità del giorno'].map((text) => ({ id: uid(), text })), ...S });
    const r2 = await db.routines.add({ name: 'Routine serale', emoji: '🌙', time: '22:00', days: [0, 1, 2, 3, 4, 5, 6], remind: true, active: true, createdAt: +addDays(now, -60), items: ['Prepara le cose per domani', 'Diario e gratitudine', 'Lettura 15 minuti'].map((text) => ({ id: uid(), text })), ...S });
    const routines = await db.routines.bulkGet([r1, r2]);
    const g1 = await db.goals.add({ title: 'Correre 10 km', category: 'salute', deadline: ymd(addDays(now, 75)), status: 'active', progressMode: 'milestones', why: 'Più energia e meno stress', createdAt: Date.now(), milestones: [
      { id: uid(), text: 'Correre 3 km senza fermarsi', done: true, doneAt: ymd(addDays(now, -20)) }, { id: uid(), text: 'Correre 5 km', done: true, doneAt: ymd(addDays(now, -4)) },
      { id: uid(), text: 'Correre 7 km', due: ymd(addDays(now, 30)), done: false }, { id: uid(), text: 'Correre 10 km', due: ymd(addDays(now, 75)), done: false }], ...S });
    await db.goals.add({ title: 'Leggere 12 libri quest’anno', category: 'apprendimento', deadline: `${now.getFullYear()}-12-31`, status: 'active', progressMode: 'manual', manualProgress: 0.6, progress: 0.6, createdAt: Date.now(), milestones: [], ...S });
    await db.goals.add({ title: 'Fondo emergenza di 3 mesi', category: 'finanze', status: 'active', progressMode: 'manual', manualProgress: 0.45, progress: 0.45, createdAt: Date.now(), milestones: [], ...S });
    const h1 = await db.habits.add({ name: 'Leggere 10 pagine', emoji: '📖', goalId: null, target: 1, days: [0, 1, 2, 3, 4, 5, 6], remindTime: '21:30', active: true, createdAt: +addDays(now, -60), ...S });
    const h2 = await db.habits.add({ name: 'Corsa o camminata', emoji: '🏃', goalId: g1, target: 1, days: [1, 3, 5], active: true, createdAt: +addDays(now, -60), ...S });
    const h3 = await db.habits.add({ name: '8 bicchieri d’acqua', emoji: '💧', goalId: null, target: 1, days: [0, 1, 2, 3, 4, 5, 6], active: true, createdAt: +addDays(now, -60), ...S });
    const logs = [], hlogs = [], moods = [], health = [], meds = [];
    for (let i = 60; i >= 1; i--) {
      const d = ymd(addDays(now, -i));
      const good = rnd();
      for (const r of routines) for (const it of r.items) if (rnd() < 0.45 + good * 0.5) logs.push({ routineId: r.id, itemId: it.id, date: d, ...S });
      for (const h of [h1, h2, h3]) if (rnd() < 0.4 + good * 0.5) hlogs.push({ habitId: h, date: d, count: 1, ...S });
      if (i <= 45) moods.push({ date: d, value: Math.max(1, Math.min(5, Math.round(2 + good * 3 + (rnd() - 0.5)))), ...S });
      if (i <= 30) {
        health.push({ type: 'sleep', date: d, value: Math.round((6 + rnd() * 2.5) * 2) / 2, ...S }, { type: 'water', date: d, value: Math.round(4 + rnd() * 5), ...S });
        if (i % 3 === 0) health.push({ type: 'weight', date: d, value: Math.round((74 - (30 - i) * 0.04 + rnd() * 0.6) * 10) / 10, ...S });
        if ([0, 2, 4].includes(weekdayIdx(addDays(now, -i)))) health.push({ type: 'workout', date: d, value: 30 + Math.round(rnd() * 40), ...S });
      }
      if (rnd() < 0.5 && i <= 30) meds.push({ date: d, medId: pick(['478', 'box', 'bodyscan', 'focus']), title: 'Sessione', minutes: pick([3, 5, 6, 8]), at: Date.now(), ...S });
    }
    await db.routineLogs.bulkPut(logs);
    await db.habitLogs.bulkPut(hlogs);
    for (const m of moods) if (!(await db.moods.get(m.date))) await db.moods.put(m);
    for (const h of health) if (!(await db.health.where('[type+date]').equals([h.type, h.date]).count())) await db.health.add(h);
    await db.meditations.bulkAdd(meds);
    await db.gratitude.bulkAdd([
      { date: ymd(addDays(now, -1)), text: 'Una lunga telefonata con un amico', ...S }, { date: ymd(addDays(now, -1)), text: 'Il sole durante la pausa pranzo', ...S }, { date: ymd(addDays(now, -2)), text: 'Ho finito un lavoro rimandato da settimane', ...S }
    ]);
    await db.journal.bulkAdd([
      { date: ymd(addDays(now, -1)), title: 'Giornata produttiva', text: 'Ho chiuso la presentazione e sono uscito a correre. Mi sento meglio quando faccio sport la sera.', tags: ['lavoro', 'sport'], mood: 4, createdAt: Date.now(), ...S },
      { date: ymd(addDays(now, -3)), title: '', text: 'Un po’ stanco. Domani provo ad andare a letto prima e a lasciare il telefono fuori dalla camera.', tags: ['sonno'], mood: 3, createdAt: Date.now(), ...S }
    ]);
    await db.notes.bulkAdd([
      { kind: 'note', title: 'Idee regalo', text: 'Mamma: libro di cucina\nLuca: cuffie\nSara: corso di ceramica', pinned: 1, createdAt: Date.now(), updatedAt: Date.now(), ...S },
      { kind: 'note', title: 'Codice Wi‑Fi ospiti', text: 'Rete: Casa-Ospiti', pinned: 0, createdAt: Date.now(), updatedAt: Date.now() - 86400000, ...S },
      { kind: 'list', listType: 'spesa', title: 'Spesa', items: ['Latte', 'Pane', 'Mele', 'Caffè', 'Detersivo'].map((text, i) => ({ id: uid(), text, done: i === 1 })), pinned: 1, createdAt: Date.now(), updatedAt: Date.now(), ...S },
      { kind: 'list', listType: 'guardare', title: 'Film da vedere', items: ['La vita è bella', 'Nuovo Cinema Paradiso', 'Il sorpasso'].map((text) => ({ id: uid(), text, done: false })), pinned: 0, createdAt: Date.now(), updatedAt: Date.now(), ...S }
    ]);
    await db.learning.bulkAdd([
      { title: 'Le abitudini che contano', type: 'libro', status: 'in corso', progress: 40, createdAt: Date.now(), updatedAt: Date.now(), ...S },
      { title: 'Corso di inglese B2', type: 'corso', status: 'in corso', progress: 25, createdAt: Date.now(), updatedAt: Date.now(), ...S },
      { title: 'Finanza personale di base', type: 'articolo', status: 'da fare', progress: 0, createdAt: Date.now(), updatedAt: Date.now(), ...S }
    ]);
    const work5 = '07:00-07:45 Colazione e routine\n08:30-12:30 Lavoro\n12:30-13:30 Pranzo\n13:30-17:30 Lavoro\n18:30-19:45 Palestra o passeggiata\n20:00-21:00 Cena\n21:00-22:00 Tempo libero\n22:00-22:30 Routine serale';
    for (let d = 0; d < 7; d++) if (!(await db.schedule.get(d))) await db.schedule.put({ weekday: d, text: d < 5 ? work5 : '09:00-10:00 Colazione con calma\n10:30-12:30 Commissioni\n13:00 Pranzo\n16:00-18:00 Uscita\n20:00 Cena', ...S });
  });
}

export async function clearSample() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      if (['settings', 'meta', 'snapshots'].includes(t.name)) continue;
      await t.filter((x) => x.sample === true).delete();
    }
  });
  for (const [type, v] of [['risparmio', 1200], ['conto', 2400], ['contanti', 250]]) {
    const a = (await lookups()).accounts.find((x) => x.type === type);
    if (a && a.initial === v) await db.accounts.update(a.id, { initial: 0 });
  }
}
export const hasSample = async () => (await db.transactions.filter((t) => t.sample === true).count()) > 0;
