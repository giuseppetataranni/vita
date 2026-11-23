import { describe, it, expect } from 'vitest';
import { parseIcs, buildIcs, parseDuration } from '../src/lib/ics.js';
import { parseCsv, parseDateIt, toCsv } from '../src/lib/csv.js';

const sample = [
  'BEGIN:VCALENDAR', 'X-WR-CALNAME:Lavoro', 'X-APPLE-CALENDAR-COLOR:#FF9500FF',
  'BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Riunione\\, team', 'DTSTART;TZID=Europe/Rome:20261118T100000', 'DTEND;TZID=Europe/Rome:20261118T110000',
  'RRULE:FREQ=WEEKLY;BYDAY=WE', 'DESCRIPTION:riga1\\nriga2 molto lunga che continua',
  ' su una riga piegata', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'END:VALARM', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a1', 'RECURRENCE-ID;TZID=Europe/Rome:20261125T100000', 'SUMMARY:Riunione spostata', 'DTSTART;TZID=Europe/Rome:20261126T100000', 'DURATION:PT30M', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:b2', 'SUMMARY:Ferie', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261227', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:c3', 'SUMMARY:Annullato', 'STATUS:CANCELLED', 'DTSTART:20261201T080000Z', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

describe('ics', () => {
  it('importa calendario con nome, colore, ricorrenze ed eccezioni', () => {
    process.env.TZ = 'Europe/Rome';
    const cal = parseIcs(sample);
    expect(cal.name).toBe('Lavoro');
    expect(cal.color).toBe('#FF9500');
    expect(cal.events).toHaveLength(3);
    const r = cal.events.find((e) => e.uid === 'a1');
    expect(r.title).toBe('Riunione, team');
    expect(r.alarm).toBe(15);
    expect(r.notes).toContain('riga piegata');
    expect(r.exdates).toEqual(['2026-11-25T10:00']);
    const moved = cal.events.find((e) => e.uid.startsWith('a1#'));
    expect(moved.end.slice(11)).toBe('10:30');
    const f = cal.events.find((e) => e.uid === 'b2');
    expect(f.allDay).toBe(true);
    expect(f.end.slice(0, 10)).toBe('2026-12-26');
  });
  it('esporta e reimporta (roundtrip)', () => {
    const txt = buildIcs([{ id: 1, title: 'Dentista; controllo', start: '2026-12-01T09:30', end: '2026-12-01T10:30', alarm: 30, rrule: 'FREQ=MONTHLY' }], { name: 'Test' });
    expect(txt).toContain('BEGIN:VALARM');
    expect(txt.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const back = parseIcs(txt).events[0];
    expect(back.title).toBe('Dentista; controllo');
    expect(back.alarm).toBe(30);
    expect(back.rrule).toBe('FREQ=MONTHLY');
  });
  it('durate', () => {
    expect(parseDuration('-PT1H30M')).toBe(-90);
    expect(parseDuration('P1D')).toBe(1440);
  });
});

describe('csv', () => {
  it('parsing con virgolette e separatore ;', () => {
    const rows = parseCsv('\uFEFFdata;descrizione;importo\n01/11/2026;"Spesa; supermercato";-45,20\n');
    expect(rows[1]).toEqual(['01/11/2026', 'Spesa; supermercato', '-45,20']);
    expect(parseDateIt('1/2/26')).toBe('2026-02-01');
    expect(toCsv([['a', 'b;c']])).toBe('\uFEFFa;"b;c"');
  });
});
