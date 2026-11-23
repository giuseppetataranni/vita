// Grafici SVG leggeri (nessuna dipendenza): ciambella, barre, linea, heatmap, anello, dispersione
import { esc } from '../core/ui.js';

const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ac8e68', '#5e5ce6', '#ff6482'];
export const color = (i) => PALETTE[i % PALETTE.length];

export function donut(items, { size = 168, thickness = 26, center = '', sub = '' } = {}) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  let off = 0;
  const arcs = total ? items.map((x, i) => {
    const len = (x.value / total) * c;
    const s = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${x.color || color(i)}" stroke-width="${thickness}" stroke-dasharray="${Math.max(0, len - 1.5)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(x.label)}</title></circle>`;
    off += len;
    return s;
  }).join('') : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--fill)" stroke-width="${thickness}"/>`;
  return `<svg class="chart donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(items.map((x) => x.label).join(', '))}">${arcs}
    <text x="50%" y="${sub ? '47%' : '52%'}" text-anchor="middle" class="c-big">${esc(center)}</text>
    ${sub ? `<text x="50%" y="62%" text-anchor="middle" class="c-sub">${esc(sub)}</text>` : ''}</svg>`;
}

export function ring(pct, { size = 96, thickness = 10, label = '', sub = '', col = 'var(--accent)' } = {}) {
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<svg class="chart ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)} ${Math.round(p * 100)}%">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--fill)" stroke-width="${thickness}"/>
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${col}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${p * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="${sub ? '50%' : '56%'}" text-anchor="middle" class="c-big">${esc(label)}</text>
    ${sub ? `<text x="50%" y="66%" text-anchor="middle" class="c-sub">${esc(sub)}</text>` : ''}</svg>`;
}

/** series: [{name, color, values:[]}], labels: [] */
export function bars(labels, series, { height = 170, fmt = (v) => v } = {}) {
  const w = 340, padL = 6, padB = 22, padT = 10;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const gw = (w - padL * 2) / labels.length;
  const bw = Math.min(18, (gw - 8) / series.length);
  const ih = height - padB - padT;
  let out = '';
  labels.forEach((l, i) => {
    const gx = padL + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0, h = (v / max) * ih;
      out += `<rect x="${gx + j * bw}" y="${padT + ih - h}" width="${bw - 2}" height="${Math.max(0, h)}" rx="3" fill="${s.color || color(j)}"><title>${esc(s.name)} ${esc(l)}: ${esc(fmt(v))}</title></rect>`;
    });
    out += `<text x="${padL + i * gw + gw / 2}" y="${height - 6}" text-anchor="middle" class="c-axis">${esc(l)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img" aria-label="Grafico a barre">${out}</svg>`;
}

/** Linea con area; values può contenere null (punto mancante) */
export function line(labels, values, { height = 150, col = 'var(--accent)', fmt = (v) => v, min = null, max = null } = {}) {
  const w = 340, padX = 8, padT = 12, padB = 22;
  const vals = values.filter((v) => v != null);
  if (!vals.length) return `<div class="empty small">Nessun dato</div>`;
  let lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const ih = height - padT - padB;
  const x = (i) => padX + (i * (w - padX * 2)) / Math.max(1, values.length - 1);
  const y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = `${path}L${pts[pts.length - 1][0]},${padT + ih}L${pts[0][0]},${padT + ih}Z`;
  const step = Math.ceil(labels.length / 6);
  const axis = labels.map((l, i) => (i % step === 0 || i === labels.length - 1 ? `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" class="c-axis">${esc(l)}</text>` : '')).join('');
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${col}"><title>${esc(fmt(vals[i]))}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" role="img" aria-label="Andamento">
    <path d="${area}" fill="${col}" opacity=".12"/><path d="${path}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dots}${axis}</svg>`;
}

/** Heatmap stile GitHub: map data->valore 0..1, weeks colonne, inizio lunedì */
export function heatmap(valueOf, endDate, { weeks = 26, col = 'var(--accent)' } = {}) {
  const cell = 11, gap = 3;
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const endWd = (end.getDay() + 6) % 7;
  const start = new Date(end); start.setDate(end.getDate() - endWd - (weeks - 1) * 7);
  let out = '';
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      if (day > end) continue;
      const v = valueOf(day);
      const op = v == null ? 0 : 0.15 + 0.85 * Math.max(0, Math.min(1, v));
      out += `<rect x="${w * (cell + gap)}" y="${d * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${v ? col : 'var(--fill)'}" ${v ? `opacity="${op.toFixed(2)}"` : ''}><title>${day.toLocaleDateString('it-IT')}: ${v == null ? '–' : Math.round(v * 100) + '%'}</title></rect>`;
    }
  }
  const W = weeks * (cell + gap), H = 7 * (cell + gap);
  return `<div class="hscroll"><svg class="chart heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Mappa di aderenza">${out}</svg></div>`;
}

export function scatter(points, { xLabel = '', yLabel = '', height = 170 } = {}) {
  const w = 340, pad = 26;
  if (!points.length) return `<div class="empty small">Servono più giorni di dati</div>`;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs) || 1], [y0, y1] = [Math.min(...ys), Math.max(...ys) || 1];
  const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (w - pad * 1.5);
  const Y = (v) => height - pad - ((v - y0) / (y1 - y0 || 1)) * (height - pad * 1.5);
  const dots = points.map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4" fill="var(--accent)" opacity=".7"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(xLabel)} rispetto a ${esc(yLabel)}">
    <line x1="${pad}" y1="${height - pad}" x2="${w}" y2="${height - pad}" stroke="var(--sep)"/><line x1="${pad}" y1="0" x2="${pad}" y2="${height - pad}" stroke="var(--sep)"/>
    ${dots}<text x="${w - 4}" y="${height - 6}" text-anchor="end" class="c-axis">${esc(xLabel)}</text><text x="4" y="12" class="c-axis">${esc(yLabel)}</text></svg>`;
}

export function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, p) => a + p.x, 0) / n, my = pairs.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const p of pairs) { num += (p.x - mx) * (p.y - my); dx += (p.x - mx) ** 2; dy += (p.y - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

export const corrLabel = (r) => r == null ? 'dati insufficienti' : Math.abs(r) < 0.2 ? 'nessuna relazione evidente' : Math.abs(r) < 0.45 ? (r > 0 ? 'relazione positiva debole' : 'relazione negativa debole') : Math.abs(r) < 0.7 ? (r > 0 ? 'relazione positiva moderata' : 'relazione negativa moderata') : (r > 0 ? 'relazione positiva forte' : 'relazione negativa forte');
