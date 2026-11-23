// Occorrenze degli eventi (calendari interni + festività + scadenze) in un intervallo
import { db, settings, lookups } from './db.js';
import { occurrences } from '../lib/rrule.js';
import { parseLocal, parseYmd, ymd, addDays } from './format.js';
import { nextDate } from '../lib/finance.js';

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
export function italianHolidays(y) {
  const e = easter(y);
  const list = [
    [new Date(y, 0, 1), 'Capodanno'], [new Date(y, 0, 6), 'Epifania'], [e, 'Pasqua'], [addDays(e, 1), 'Lunedì dell’Angelo'],
    [new Date(y, 3, 25), 'Festa della Liberazione'], [new Date(y, 4, 1), 'Festa del Lavoro'], [new Date(y, 5, 2), 'Festa della Repubblica'],
    [new Date(y, 7, 15), 'Ferragosto'], [new Date(y, 10, 1), 'Ognissanti'], [new Date(y, 11, 8), 'Immacolata Concezione'],
    [new Date(y, 11, 25), 'Natale'], [new Date(y, 11, 26), 'Santo Stefano']
  ];
  if (y >= 2026) list.push([new Date(y, 9, 4), 'San Francesco d’Assisi']);
  return list;
}

export const VIRTUAL = {
  holidays: { id: 'holidays', name: 'Festività italiane', color: '#ff3b30', virtual: true },
  deadlines: { id: 'deadlines', name: 'Scadenze (finanze e obiettivi)', color: '#8e8e93', virtual: true }
};

/** Ritorna [{key, ev, cal, start, end, allDay, color, title, virtual, link}] ordinate per inizio */
export async function getOccurrences(from, to, { all = false } = {}) {
  const { calendars } = await lookups();
  const visible = new Map(calendars.filter((c) => all || c.visible !== false).map((c) => [c.id, c]));
  const events = await db.events.toArray();
  const out = [];
  for (const ev of events) {
    const cal = visible.get(ev.calendarId);
    if (!cal) continue;
    const s = parseLocal(ev.start), e = parseLocal(ev.end || ev.start);
    const dur = Math.max(0, e - s);
    const winFrom = new Date(from.getTime() - dur);
    const starts = ev.rrule ? occurrences(s, ev.rrule, winFrom, to, (ev.exdates || []).map(parseLocal), 500) : (s <= to && e >= from ? [s] : []);
    for (const st of starts) {
      const en = new Date(st.getTime() + dur);
      if (en < from && !(ev.allDay && ymd(en) === ymd(from))) continue;
      out.push({ key: `${ev.id}@${st.getTime()}`, ev, cal, start: st, end: en, allDay: !!ev.allDay, color: ev.color || cal.color, title: ev.title });
    }
  }
  if (settings.showHolidays) {
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      for (const [d, name] of italianHolidays(y)) {
        if (d >= addDays(from, -1) && d <= to) out.push({ key: `hol-${ymd(d)}`, cal: VIRTUAL.holidays, start: d, end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59), allDay: true, color: VIRTUAL.holidays.color, title: name, virtual: true });
      }
    }
  }
  if (settings.showDeadlines) out.push(...(await deadlines(from, to)));
  return out.filter((o) => o.end >= from && o.start <= to).sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start));
}

async function deadlines(from, to) {
  const out = [];
  const add = (dateStr, title, link, emoji) => {
    const d = parseYmd(dateStr);
    if (d >= startOf(from) && d <= to) out.push({ key: `dl-${link}-${dateStr}`, cal: VIRTUAL.deadlines, start: d, end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59), allDay: true, color: VIRTUAL.deadlines.color, title: `${emoji} ${title}`, virtual: true, link });
  };
  const [rec, debts, goals] = await Promise.all([db.recurring.toArray(), db.debts.toArray(), db.goals.toArray()]);
  for (const r of rec.filter((x) => x.active !== false)) {
    let d = r.nextDate, n = 0;
    while (d && d <= ymd(to) && n++ < 60) { if (r.endDate && d > r.endDate) break; add(d, r.title, '#/finanze/pianifica', '💳'); d = nextDate(d, r.freq, r.interval); }
  }
  for (const x of debts.filter((d) => !d.settled && d.dueDate)) add(x.dueDate, `${x.direction === 'owed' ? 'Incassare da' : 'Restituire a'} ${x.person}`, '#/finanze/pianifica', '🤝');
  for (const g of goals.filter((x) => x.status !== 'done')) {
    if (g.deadline) add(g.deadline, `Scadenza: ${g.title}`, '#/routine/obiettivi', '🎯');
    for (const m of g.milestones || []) if (!m.done && m.due) add(m.due, `${g.title} · ${m.text}`, '#/routine/obiettivi', '🏁');
  }
  return out;
}
const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
