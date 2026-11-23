// Formati italiani: EUR, date, settimana che inizia il lunedì
const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const money = (v) => eurFmt.format(Number(v) || 0);
export const moneyShort = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v) || 0);
export const num = (v, d = 0) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) || 0);
export const pct = (v, d = 0) => `${num((Number(v) || 0) * 100, d)}%`;
export const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const ymOf = (d) => ymd(d).slice(0, 7);
export const thisMonth = () => ymOf(new Date());
export const parseYmd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const parseLocal = (s) => {
  const [d, t = '00:00'] = String(s).split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h || 0, mi || 0);
};
export const toLocalIso = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const addMonths = (d, n, clamp = true) => {
  const day = d.getDate();
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  const dim = daysInMonth(x.getFullYear(), x.getMonth());
  x.setDate(clamp ? Math.min(day, dim) : day);
  return x;
};
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const weekdayIdx = (d) => (d.getDay() + 6) % 7; // 0 = lunedì
export const startOfWeek = (d) => addDays(startOfDay(d), -weekdayIdx(d));
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const diffDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
export const monthShift = (ym, n) => { const [y, m] = ym.split('-').map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
export const dayOfYear = (d) => diffDays(new Date(d.getFullYear(), 0, 1), d) + 1;
export const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
};

export const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WD1 = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
export const WD_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${cap(MONTHS[m - 1])} ${y}`; };
export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  (typeof d === 'string' ? parseYmd(d) : d).toLocaleDateString('it-IT', opts);
export const fmtDay = (d) => cap(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }));
export const fmtTime = (d) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
export const relDay = (s) => {
  const n = diffDays(new Date(), typeof s === 'string' ? parseYmd(s) : s);
  if (n === 0) return 'Oggi';
  if (n === 1) return 'Domani';
  if (n === -1) return 'Ieri';
  if (n > 1 && n < 7) return cap(WD_LONG[weekdayIdx(addDays(new Date(), n))]);
  return fmtDate(typeof s === 'string' ? s : ymd(s));
};

// "1.234,56" | "1234.56" | "12,5" -> number
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim().replace(/[€\s]/g, '');
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');
  else if (lastComma === -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
