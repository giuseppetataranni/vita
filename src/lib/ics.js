// Import/export iCalendar (.ics) con fusi orari, ricorrenze, eccezioni e VALARM
import { toLocalIso, ymd, pad, parseLocal, addDays } from '../core/format.js';

const unfold = (text) => String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
const unescapeText = (s) => s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function parseLine(line) {
  // NOME;PARAM=VAL;PARAM2="x:y":VALORE
  let i = 0, inQ = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...params] = head.split(';');
  const p = {};
  for (const x of params) { const [k, v = ''] = x.split('='); p[k.toUpperCase()] = v.replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params: p, value };
}

function tzOffset(ts, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ts;
}

const WIN_TZ = { 'W. Europe Standard Time': 'Europe/Rome', 'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'Central Europe Standard Time': 'Europe/Budapest', 'Eastern Standard Time': 'America/New_York', 'Pacific Standard Time': 'America/Los_Angeles', 'UTC': 'UTC' };

export function zonedToDate(y, mo, d, h, mi, s, tz) {
  const zone = WIN_TZ[tz] || tz;
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const off = tzOffset(guess, zone);
    let t = guess - off;
    const off2 = tzOffset(t, zone);
    if (off2 !== off) t = guess - off2;
    return new Date(t);
  } catch {
    return new Date(y, mo - 1, d, h, mi, s);
  }
}

// Ritorna { date: Date (ora locale), allDay }
export function parseDateProp(value, params = {}) {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', z] = m;
  if (h === undefined || params.VALUE === 'DATE') return { date: new Date(+y, mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)), allDay: false };
  if (params.TZID) return { date: zonedToDate(+y, +mo, +d, +h, +mi, +s, params.TZID), allDay: false };
  return { date: new Date(+y, mo - 1, +d, +h, +mi, +s), allDay: false };
}

export function parseDuration(v) {
  const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w = 0, d = 0, h = 0, mi = 0, s = 0] = m;
  const minutes = (+w) * 10080 + (+d) * 1440 + (+h) * 60 + (+mi) + Math.round(+s / 60);
  return sign === '-' ? -minutes : minutes;
}

/** Converte un testo .ics in { name, color, events: [...] } */
export function parseIcs(text) {
  const lines = unfold(text).split('\n').filter((l) => l.trim());
  const cal = { name: '', color: '', events: [] };
  let ev = null, inAlarm = false, alarm = null;
  for (const raw of lines) {
    const { name, params, value } = parseLine(raw);
    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') { ev = { exdates: [] }; continue; }
    if (name === 'BEGIN' && value.toUpperCase() === 'VALARM' && ev) { inAlarm = true; alarm = {}; continue; }
    if (name === 'END' && value.toUpperCase() === 'VALARM') {
      inAlarm = false;
      if (ev && alarm && alarm.minutes != null && (ev.alarm == null || alarm.minutes < ev.alarm)) ev.alarm = alarm.minutes;
      continue;
    }
    if (name === 'END' && value.toUpperCase() === 'VEVENT') { if (ev) cal.events.push(finish(ev)); ev = null; continue; }
    if (!ev) {
      if (name === 'X-WR-CALNAME') cal.name = unescapeText(value);
      if (name === 'X-APPLE-CALENDAR-COLOR' || name === 'COLOR') cal.color = value.slice(0, 7);
      continue;
    }
    if (inAlarm) {
      if (name === 'TRIGGER') {
        if (params.VALUE === 'DATE-TIME') alarm.abs = parseDateProp(value, params);
        else alarm.minutes = -parseDuration(value);
      }
      continue;
    }
    switch (name) {
      case 'UID': ev.uid = value.trim(); break;
      case 'SUMMARY': ev.title = unescapeText(value); break;
      case 'LOCATION': ev.location = unescapeText(value); break;
      case 'DESCRIPTION': ev.notes = unescapeText(value); break;
      case 'DTSTART': ev._start = parseDateProp(value, params); break;
      case 'DTEND': ev._end = parseDateProp(value, params); break;
      case 'DURATION': ev._dur = parseDuration(value); break;
      case 'RRULE': ev.rrule = value.trim(); break;
      case 'EXDATE': for (const v of value.split(',')) { const p = parseDateProp(v, params); if (p) ev.exdates.push(toLocalIso(p.date)); } break;
      case 'RECURRENCE-ID': { const p = parseDateProp(value, params); if (p) ev.recurrenceId = toLocalIso(p.date); break; }
      case 'STATUS': ev.status = value.trim().toUpperCase(); break;
      case 'COLOR': ev.color = value.trim(); break;
      default: break;
    }
  }
  // Le istanze modificate (RECURRENCE-ID) diventano eccezioni della serie principale
  const masters = new Map(cal.events.filter((e) => !e.recurrenceId).map((e) => [e.uid, e]));
  for (const e of cal.events) {
    if (e.recurrenceId && masters.has(e.uid)) {
      masters.get(e.uid).exdates.push(e.recurrenceId);
      e.uid = `${e.uid}#${e.recurrenceId}`;
    }
  }
  cal.events = cal.events.filter((e) => e.start && e.status !== 'CANCELLED');
  return cal;
}

function finish(ev) {
  if (!ev._start) return ev;
  const allDay = ev._start.allDay;
  const start = ev._start.date;
  let end;
  if (ev._end) end = ev._end.date;
  else if (ev._dur) end = new Date(start.getTime() + ev._dur * 60000);
  else end = allDay ? addDays(start, 1) : new Date(start.getTime() + 3600000);
  if (allDay) end = addDays(end, -1); // DTEND esclusivo -> ultimo giorno incluso
  const out = {
    uid: ev.uid || `imp-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: ev.title || '(senza titolo)',
    location: ev.location || '',
    notes: ev.notes || '',
    allDay,
    start: allDay ? ymd(start) + 'T00:00' : toLocalIso(start),
    end: allDay ? ymd(end < start ? start : end) + 'T23:59' : toLocalIso(end),
    rrule: ev.rrule || '',
    exdates: ev.exdates,
    alarm: ev.alarm ?? null,
    status: ev.status
  };
  if (ev.recurrenceId) out.recurrenceId = ev.recurrenceId;
  if (ev.color) out.color = ev.color;
  return out;
}

// ---------- Export ----------
const fold = (line) => {
  const out = [];
  let s = line;
  const enc = new TextEncoder();
  while (enc.encode(s).length > 74) {
    let cut = 74;
    while (enc.encode(s.slice(0, cut)).length > 74) cut--;
    out.push(s.slice(0, cut));
    s = ' ' + s.slice(cut);
  }
  out.push(s);
  return out.join('\r\n');
};
const fmtLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const fmtUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const fmtDateOnly = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

const ROME_TZ = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

/** events: oggetti evento dell'app. Ritorna il testo .ics */
export function buildIcs(events, { name = 'Vita', color = '' } = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vita//PWA//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`, `X-WR-TIMEZONE:${tz}`];
  if (color) L.push(`X-APPLE-CALENDAR-COLOR:${color}`);
  if (tz === 'Europe/Rome') L.push(...ROME_TZ);
  const stamp = fmtUtc(new Date());
  for (const e of events) {
    const s = parseLocal(e.start), en = parseLocal(e.end || e.start);
    L.push('BEGIN:VEVENT', `UID:${e.uid || e.id + '@vita'}`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(e.title)}`);
    if (e.allDay) {
      L.push(`DTSTART;VALUE=DATE:${fmtDateOnly(s)}`, `DTEND;VALUE=DATE:${fmtDateOnly(addDays(en, 1))}`);
    } else {
      L.push(`DTSTART;TZID=${tz}:${fmtLocal(s)}`, `DTEND;TZID=${tz}:${fmtLocal(en > s ? en : new Date(s.getTime() + 3600000))}`);
    }
    if (e.location) L.push(`LOCATION:${escapeText(e.location)}`);
    if (e.notes) L.push(`DESCRIPTION:${escapeText(e.notes)}`);
    if (e.rrule) L.push(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`);
    for (const x of e.exdates || []) {
      const d = parseLocal(x);
      L.push(e.allDay ? `EXDATE;VALUE=DATE:${fmtDateOnly(d)}` : `EXDATE;TZID=${tz}:${fmtLocal(d)}`);
    }
    if (e.alarm != null && e.alarm !== '') {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:-PT${Math.max(0, Number(e.alarm))}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
