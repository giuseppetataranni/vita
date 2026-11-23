// CSV con separatore ; (compatibile Excel/Numbers in italiano) e parser robusto
export function toCsv(rows, sep = ';') {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(q).join(sep)).join('\r\n');
}

export function parseCsv(text) {
  const t = String(text).replace(/^\uFEFF/, '');
  const firstLine = t.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ((firstLine.match(/\t/g) || []).length ? '\t' : ',');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// "31/12/2026", "31-12-26", "2026-12-31" -> "2026-12-31"
export function parseDateIt(s) {
  const v = String(s).trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
