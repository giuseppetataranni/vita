// Ricorrenze RRULE semplificate (RFC 5545): DAILY, WEEKLY, MONTHLY, YEARLY
// con INTERVAL, COUNT, UNTIL, BYDAY (anche 2MO / -1FR), BYMONTHDAY, EXDATE.
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const wd = (d) => (d.getDay() + 6) % 7;

export function parseRRule(str) {
  if (!str) return null;
  const r = { freq: null, interval: 1, count: null, until: null, byday: [], bymonthday: [] };
  for (const part of String(str).replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('=');
    if (!v) continue;
    const key = k.toUpperCase();
    if (key === 'FREQ') r.freq = v.toUpperCase();
    else if (key === 'INTERVAL') r.interval = Math.max(1, parseInt(v, 10) || 1);
    else if (key === 'COUNT') r.count = parseInt(v, 10);
    else if (key === 'UNTIL') r.until = parseIcsDate(v);
    else if (key === 'BYDAY') r.byday = v.split(',').map((x) => {
      const m = x.trim().toUpperCase().match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
      return m ? { n: m[1] ? parseInt(m[1], 10) : 0, day: DAYS.indexOf(m[2]) } : null;
    }).filter(Boolean);
    else if (key === 'BYMONTHDAY') r.bymonthday = v.split(',').map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
  }
  return ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq) ? r : null;
}

export function parseIcsDate(v) {
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '59', z] = m;
  if (z) return new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s));
  return new Date(+y, mo - 1, +d, +h, +mi, +s);
}

export function buildRRule({ freq, interval = 1, byday = [], count, until }) {
  if (!freq) return '';
  const p = [`FREQ=${freq}`];
  if (interval > 1) p.push(`INTERVAL=${interval}`);
  if (byday.length) p.push(`BYDAY=${byday.map((d) => (typeof d === 'number' ? DAYS[d] : `${d.n || ''}${DAYS[d.day]}`)).join(',')}`);
  if (count) p.push(`COUNT=${count}`);
  if (until) p.push(`UNTIL=${until.replace(/-/g, '')}T235959`);
  return p.join(';');
}

function nthWeekdayOfMonth(y, m, day, n) {
  if (n > 0) {
    const first = new Date(y, m, 1);
    const off = (day - wd(first) + 7) % 7;
    const date = 1 + off + (n - 1) * 7;
    return date <= new Date(y, m + 1, 0).getDate() ? date : null;
  }
  const last = new Date(y, m + 1, 0);
  const off = (wd(last) - day + 7) % 7;
  const date = last.getDate() - off + (n + 1) * 7;
  return date >= 1 ? date : null;
}

/**
 * Occorrenze di una serie tra `from` e `to` (inclusi).
 * start: Date di inizio della serie; rule: stringa RRULE o oggetto parsato.
 */
export function occurrences(start, rule, from, to, exdates = [], limit = 2000) {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule;
  if (!r) return start >= from && start <= to ? [new Date(start)] : [];
  const ex = new Set(exdates.map((d) => +d));
  const out = [];
  let produced = 0;
  const h = start.getHours(), mi = start.getMinutes();
  const accept = (d) => {
    if (d < start) return true;
    if (r.until && d > r.until) return false;
    if (r.count && produced >= r.count) return false;
    produced++;
    if (d >= from && d <= to && !ex.has(+d)) out.push(d);
    return d <= to && out.length < limit;
  };
  const hardStop = (d) => d > to || (r.until && d > r.until) || (r.count && produced >= r.count);
  let guard = 0;

  if (r.freq === 'DAILY') {
    for (let d = new Date(start); guard++ < 40000; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + r.interval, h, mi)) {
      if (hardStop(d) || !accept(d)) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const days = r.byday.length ? r.byday.map((b) => b.day).sort((a, b) => a - b) : [wd(start)];
    let week = new Date(start.getFullYear(), start.getMonth(), start.getDate() - wd(start), h, mi);
    outer: for (; guard++ < 10000; week = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7 * r.interval, h, mi)) {
      for (const dd of days) {
        const d = new Date(week.getFullYear(), week.getMonth(), week.getDate() + dd, h, mi);
        if (d < start) continue;
        if (hardStop(d) || !accept(d)) break outer;
      }
    }
  } else if (r.freq === 'MONTHLY') {
    for (let k = 0; guard++ < 3000; k += r.interval) {
      const y = start.getFullYear(), m = start.getMonth() + k;
      const base = new Date(y, m, 1);
      const by = base.getFullYear(), bm = base.getMonth();
      if (new Date(by, bm, 1) > to || (r.until && new Date(by, bm, 1) > r.until)) break;
      let dates = [];
      if (r.byday.length) {
        for (const b of r.byday) {
          if (b.n) { const x = nthWeekdayOfMonth(by, bm, b.day, b.n); if (x) dates.push(x); }
          else { for (let x = 1; x <= new Date(by, bm + 1, 0).getDate(); x++) if (wd(new Date(by, bm, x)) === b.day) dates.push(x); }
        }
      } else if (r.bymonthday.length) {
        const dim = new Date(by, bm + 1, 0).getDate();
        dates = r.bymonthday.map((x) => (x < 0 ? dim + x + 1 : x)).filter((x) => x >= 1 && x <= dim);
      } else {
        const x = start.getDate();
        if (x <= new Date(by, bm + 1, 0).getDate()) dates.push(x);
      }
      let stop = false;
      for (const x of [...new Set(dates)].sort((a, b) => a - b)) {
        const d = new Date(by, bm, x, h, mi);
        if (d < start) continue;
        if (hardStop(d) || !accept(d)) { stop = true; break; }
      }
      if (stop) break;
    }
  } else if (r.freq === 'YEARLY') {
    for (let k = 0; guard++ < 500; k += r.interval) {
      const y = start.getFullYear() + k;
      if (start.getMonth() === 1 && start.getDate() === 29 && new Date(y, 1, 29).getMonth() !== 1) continue;
      const d = new Date(y, start.getMonth(), start.getDate(), h, mi);
      if (hardStop(d) || !accept(d)) break;
    }
  }
  return out;
}

// Descrizione leggibile in italiano
export function describeRRule(str) {
  const r = parseRRule(str);
  if (!r) return 'Mai';
  const every = { DAILY: ['Ogni giorno', 'giorni'], WEEKLY: ['Ogni settimana', 'settimane'], MONTHLY: ['Ogni mese', 'mesi'], YEARLY: ['Ogni anno', 'anni'] }[r.freq];
  let s = r.interval > 1 ? `Ogni ${r.interval} ${every[1]}` : every[0];
  const names = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
  if (r.byday.length) s += ` (${r.byday.map((b) => (b.n ? `${b.n === -1 ? 'ultimo' : b.n + 'º'} ` : '') + names[b.day]).join(', ')})`;
  if (r.count) s += `, ${r.count} volte`;
  if (r.until) s += `, fino al ${r.until.toLocaleDateString('it-IT')}`;
  return s;
}
