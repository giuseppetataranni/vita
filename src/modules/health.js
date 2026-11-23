// Salute di base: acqua, sonno, peso, allenamento
import { db, settings, setSetting } from '../core/db.js';
import { html, raw, bindActions, formSheet, toast, pageHeader, empty, haptic, progress } from '../core/ui.js';
import { ymd, today, addDays, num, fmtDate } from '../core/format.js';
import { line, bars } from '../lib/charts.js';

export const METRICS = {
  water: { label: 'Acqua', emoji: '💧', unit: 'bicchieri', step: 1, d: 0 },
  sleep: { label: 'Sonno', emoji: '😴', unit: 'ore', step: 0.5, d: 1 },
  weight: { label: 'Peso', emoji: '⚖️', unit: 'kg', step: 0.1, d: 1 },
  workout: { label: 'Allenamento', emoji: '🏃', unit: 'minuti', step: 5, d: 0 },
  steps: { label: 'Passi', emoji: '👣', unit: 'passi', step: 500, d: 0 }
};

export async function getValue(type, date = today()) { return (await db.health.where('[type+date]').equals([type, date]).first())?.value ?? null; }
export async function setValue(type, value, date = today()) {
  const ex = await db.health.where('[type+date]').equals([type, date]).first();
  if (value == null || value === '' || Number.isNaN(value)) { if (ex) await db.health.delete(ex.id); return; }
  if (ex) await db.health.update(ex.id, { value }); else await db.health.add({ type, date, value });
}
export async function addWater(delta = 1) {
  const v = Math.max(0, ((await getValue('water')) || 0) + delta);
  await setValue('water', v);
  haptic();
  return v;
}

export async function render(root, route, ctx) {
  const t = today();
  const since = ymd(addDays(new Date(), -29));
  const rows = await db.health.where('date').aboveOrEqual(since).toArray();
  const series = (type) => { const m = new Map(rows.filter((r) => r.type === type).map((r) => [r.date, r.value])); return Array.from({ length: 30 }, (_, i) => m.get(ymd(addDays(new Date(), i - 29))) ?? null); };
  const labels = Array.from({ length: 30 }, (_, i) => String(addDays(new Date(), i - 29).getDate()));
  const todayV = Object.fromEntries(Object.keys(METRICS).map((k) => [k, rows.find((r) => r.type === k && r.date === t)?.value ?? null]));
  const avg = (type) => { const v = series(type).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const lastWeight = (await db.health.where('type').equals('weight').sortBy('date')).pop();
  root.innerHTML = String(html`${pageHeader('Salute', { back: { href: '#/altro', label: 'Altro' } })}<main class="page">
  <div class="card"><h3>💧 Acqua oggi <span>${todayV.water || 0}/${settings.waterTarget}</span></h3>${progress((todayV.water || 0) / settings.waterTarget, (todayV.water || 0) >= settings.waterTarget ? 'good' : '')}
    <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="water" data-d="-1" aria-label="Togli un bicchiere">−</button><button class="btn filled" data-act="water" data-d="1">+ 1 bicchiere</button></div></div>
  <div class="grid2" style="margin-top:12px">${Object.entries(METRICS).filter(([k]) => k !== 'water').map(([k, m]) => html`<button class="card stat" style="border:0;text-align:left" data-act="set" data-type="${k}"><div class="l">${m.emoji} ${m.label} oggi</div><div class="v">${todayV[k] != null ? num(todayV[k], m.d) : '–'}</div><div class="l">${m.unit}${k === 'weight' && todayV.weight == null && lastWeight ? ` · ultimo ${num(lastWeight.value, 1)} (${fmtDate(lastWeight.date, { day: 'numeric', month: 'short' })})` : ''}</div></button>`)}</div>
  <h2 class="section-title">Ultimi 30 giorni</h2>
  <div class="card"><h3>😴 Sonno <span class="muted">media ${avg('sleep') != null ? num(avg('sleep'), 1) + ' h' : '–'}</span></h3>${raw(bars(labels.map((l, i) => (i % 5 === 4 ? l : '')), [{ name: 'Sonno', color: 'var(--accent)', values: series('sleep').map((v) => v || 0) }], { fmt: (v) => `${v} h` }))}</div>
  <div class="card"><h3>⚖️ Peso</h3>${raw(line(labels, series('weight'), { fmt: (v) => `${num(v, 1)} kg` }))}</div>
  <div class="card"><h3>🏃 Allenamento <span class="muted">${num(series('workout').reduce((a, b) => a + (b || 0), 0))} min totali</span></h3>${raw(bars(labels.map((l, i) => (i % 5 === 4 ? l : '')), [{ name: 'Minuti', color: 'var(--green)', values: series('workout').map((v) => v || 0) }], { fmt: (v) => `${v} min` }))}</div>
  <div class="card"><h3>💧 Acqua <span class="muted">media ${avg('water') != null ? num(avg('water'), 1) : '–'}</span></h3>${raw(bars(labels.map((l, i) => (i % 5 === 4 ? l : '')), [{ name: 'Bicchieri', color: '#64d2ff', values: series('water').map((v) => v || 0) }]))}</div>
  <button class="btn block" data-act="targets">Obiettivi giornalieri</button>
  <p class="caption">Puoi inserire o correggere i valori di un giorno passato toccando una voce e cambiando la data.</p></main>`);
  const refresh = () => ctx.rerender();
  return bindActions(root, {
    water: async ({ d }) => { const v = await addWater(Number(d)); if (v === settings.waterTarget && Number(d) > 0) toast('Obiettivo acqua raggiunto 💧'); refresh(); },
    set: async ({ type }) => {
      const m = METRICS[type];
      const r = await formSheet({
        title: `${m.emoji} ${m.label}`, values: { date: t, value: todayV[type] ?? (type === 'weight' ? lastWeight?.value : '') },
        fields: [{ name: 'value', label: m.unit, type: 'number', step: m.step, min: 0, autofocus: true, help: 'Lascia vuoto per cancellare il valore' }, { name: 'date', label: 'Giorno', type: 'date', required: true }]
      });
      if (!r) return;
      await setValue(type, r.value, r.date); refresh();
    },
    targets: async () => {
      const r = await formSheet({ title: 'Obiettivi', values: { waterTarget: settings.waterTarget, sleepTarget: settings.sleepTarget }, fields: [{ name: 'waterTarget', label: 'Bicchieri d’acqua', type: 'number', min: 1, step: 1 }, { name: 'sleepTarget', label: 'Ore di sonno', type: 'number', min: 4, step: 0.5 }] });
      if (r) { await setSetting('waterTarget', r.waterTarget || 8); await setSetting('sleepTarget', r.sleepTarget || 8); refresh(); }
    }
  });
}
