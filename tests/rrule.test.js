import { describe, it, expect } from 'vitest';
import { occurrences, parseRRule, describeRRule } from '../src/lib/rrule.js';
import { ymd } from '../src/core/format.js';

const d = (s, h = 9) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd, h, 0); };
const days = (arr) => arr.map(ymd);

describe('ricorrenze', () => {
  it('giornaliera con COUNT', () => {
    expect(days(occurrences(d('2026-11-01'), 'FREQ=DAILY;COUNT=3', d('2026-01-01'), d('2027-01-01')))).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
  it('settimanale lun/mer/ven con intervallo', () => {
    const r = occurrences(d('2026-11-02'), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR', d('2026-11-01'), d('2026-11-30'));
    expect(days(r)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-16', '2026-11-18', '2026-11-20', '2026-11-30']);
  });
  it('mensile il 31 salta i mesi corti (RFC)', () => {
    expect(days(occurrences(d('2026-01-31'), 'FREQ=MONTHLY;COUNT=4', d('2026-01-01'), d('2026-12-31')))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31']);
  });
  it('mensile secondo lunedì e ultimo venerdì', () => {
    expect(days(occurrences(d('2026-11-09'), 'FREQ=MONTHLY;BYDAY=2MO', d('2026-11-01'), d('2027-01-31')))).toEqual(['2026-11-09', '2026-12-14', '2027-01-11']);
    expect(days(occurrences(d('2026-11-27'), 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=2', d('2026-01-01'), d('2027-12-31')))).toEqual(['2026-11-27', '2026-12-25']);
  });
  it('annuale con UNTIL ed EXDATE', () => {
    const r = occurrences(d('2024-05-10'), 'FREQ=YEARLY;UNTIL=20270101T000000Z', d('2024-01-01'), d('2030-01-01'), [d('2025-05-10')]);
    expect(days(r)).toEqual(['2024-05-10', '2026-05-10']);
  });
  it('finestra che inizia dopo il primo evento rispetta COUNT', () => {
    expect(days(occurrences(d('2026-11-01'), 'FREQ=DAILY;COUNT=5', d('2026-11-04'), d('2026-12-01')))).toEqual(['2026-11-04', '2026-11-05']);
  });
  it('parsing e descrizione', () => {
    expect(parseRRule('RRULE:FREQ=WEEKLY;BYDAY=TU').byday[0].day).toBe(1);
    expect(describeRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Ogni 2 settimane (lun)');
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
  });
});
