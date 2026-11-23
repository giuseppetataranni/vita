// Logica finanziaria pura (testata con Vitest)
import { round2, parseYmd, ymd, addMonths, addDays, daysInMonth, monthShift, diffDays } from '../core/format.js';

const sum = (arr, f = (x) => x) => round2(arr.reduce((a, x) => a + (Number(f(x)) || 0), 0));

export function accountBalances(accounts, txs, upTo = null) {
  const bal = new Map(accounts.map((a) => [a.id, Number(a.initial) || 0]));
  for (const t of txs) {
    if (upTo && t.date > upTo) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') bal.set(t.accountId, (bal.get(t.accountId) || 0) + amt);
    else if (t.type === 'expense') bal.set(t.accountId, (bal.get(t.accountId) || 0) - amt);
    else if (t.type === 'transfer') {
      bal.set(t.accountId, (bal.get(t.accountId) || 0) - amt);
      bal.set(t.toAccountId, (bal.get(t.toAccountId) || 0) + amt);
    }
  }
  for (const [k, v] of bal) bal.set(k, round2(v));
  return bal;
}

export const totalBalance = (accounts, txs, upTo = null) => {
  const b = accountBalances(accounts.filter((a) => !a.archived), txs, upTo);
  return sum([...b.values()]);
};

export const inMonth = (txs, ym) => txs.filter((t) => t.date && t.date.startsWith(ym));

export function summarize(txs) {
  const income = sum(txs.filter((t) => t.type === 'income'), (t) => t.amount);
  const expense = sum(txs.filter((t) => t.type === 'expense'), (t) => t.amount);
  return { income, expense, net: round2(income - expense) };
}

export function monthStats(txs, ym, todayStr) {
  const [y, m] = ym.split('-').map(Number);
  const dim = daysInMonth(y, m - 1);
  const s = summarize(inMonth(txs, ym));
  let daysElapsed = dim;
  if (todayStr.startsWith(ym)) daysElapsed = Number(todayStr.slice(8, 10));
  else if (todayStr < ym) daysElapsed = 0;
  const dailyAvg = daysElapsed ? round2(s.expense / daysElapsed) : 0;
  const forecastExpense = daysElapsed ? round2((s.expense / daysElapsed) * dim) : 0;
  return {
    ...s,
    savingsRate: s.income > 0 ? s.net / s.income : 0,
    dailyAvg,
    forecastExpense,
    forecastNet: round2(s.income - forecastExpense),
    daysElapsed,
    dim
  };
}

export const rootCategoryId = (catId, catMap) => {
  let c = catMap.get(catId), guard = 0;
  while (c && c.parentId && catMap.has(c.parentId) && guard++ < 10) c = catMap.get(c.parentId);
  return c ? c.id : catId;
};

export function byCategory(txs, categories, { kind = 'expense', rollup = true } = {}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const t of txs) {
    if (t.type !== kind) continue;
    const id = rollup ? rootCategoryId(t.categoryId, catMap) : t.categoryId;
    totals.set(id ?? 0, round2((totals.get(id ?? 0) || 0) + Number(t.amount)));
  }
  const total = sum([...totals.values()]);
  return [...totals.entries()]
    .map(([id, value]) => ({ id, category: catMap.get(id) || { id: 0, name: 'Senza categoria', icon: '❔', color: '#8e8e93' }, value, pct: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function budgetStatus(budgets, txs, categories, ym) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const monthExp = inMonth(txs, ym).filter((t) => t.type === 'expense');
  return budgets.filter((b) => b.amount > 0).map((b) => {
    const spent = sum(monthExp.filter((t) => t.categoryId === b.categoryId || rootCategoryId(t.categoryId, catMap) === b.categoryId), (t) => t.amount);
    const pct = spent / b.amount;
    return { budget: b, category: catMap.get(b.categoryId), spent, left: round2(b.amount - spent), pct, level: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok' };
  }).sort((a, b) => b.pct - a.pct);
}

/** Regola 50/30/20: le categorie hanno group = need | want | save */
export function rule503020(txs, categories) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const groupOf = (t) => {
    const c = catMap.get(t.categoryId);
    const root = catMap.get(rootCategoryId(t.categoryId, catMap));
    return (c && c.group) || (root && root.group) || 'want';
  };
  const { income, expense } = summarize(txs);
  const exp = txs.filter((t) => t.type === 'expense');
  const need = sum(exp.filter((t) => groupOf(t) === 'need'), (t) => t.amount);
  const want = sum(exp.filter((t) => groupOf(t) === 'want'), (t) => t.amount);
  const saveExplicit = sum(exp.filter((t) => groupOf(t) === 'save'), (t) => t.amount);
  const save = round2(saveExplicit + Math.max(0, income - expense));
  const base = income || need + want + save || 1;
  return { income, need, want, save, needPct: need / base, wantPct: want / base, savePct: save / base };
}

export function monthlySeries(txs, ym, n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = monthShift(ym, -i);
    out.push({ ym: k, ...summarize(inMonth(txs, k)) });
  }
  return out;
}

export function avgMonthlyExpense(txs, ym, months = 3) {
  const series = monthlySeries(txs, monthShift(ym, -1), months).filter((x) => x.expense > 0);
  if (!series.length) return summarize(inMonth(txs, ym)).expense;
  return round2(series.reduce((a, x) => a + x.expense, 0) / series.length);
}

export const emergencyMonths = (liquid, avgExpense) => (avgExpense > 0 ? Math.max(0, liquid) / avgExpense : liquid > 0 ? 99 : 0);

export function fixedVsVariable(txs, categories) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const exp = txs.filter((t) => t.type === 'expense');
  const isFixed = (t) => t.fixed || !!t.recurringId || !!(catMap.get(t.categoryId)?.fixed) || !!(catMap.get(rootCategoryId(t.categoryId, catMap))?.fixed);
  const fixed = sum(exp.filter(isFixed), (t) => t.amount);
  const variable = round2(sum(exp, (t) => t.amount) - fixed);
  return { fixed, variable };
}

export function compareMonths(txs, ym) {
  const cur = summarize(inMonth(txs, ym));
  const prev = summarize(inMonth(txs, monthShift(ym, -1)));
  const delta = (a, b) => (b ? (a - b) / b : 0);
  return { cur, prev, expenseDelta: delta(cur.expense, prev.expense), incomeDelta: delta(cur.income, prev.income) };
}

export function balanceTrend(accounts, txs, ym, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = monthShift(ym, -i);
    const [y, m] = k.split('-').map(Number);
    const last = `${k}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}`;
    out.push({ ym: k, value: totalBalance(accounts, txs, last) });
  }
  return out;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function gradeOf(score) {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E';
}

/** Punteggio salute finanziaria 0–100 */
export function healthScore({ income, savingsRate, emergency, emergencyTarget = 6, budgets = [], rule, debtOwed = 0 }) {
  const parts = {};
  parts.risparmio = income > 0 ? 30 * clamp01(savingsRate / 0.2) : 0;
  parts.emergenza = 25 * clamp01(emergency / emergencyTarget);
  if (budgets.length) {
    const pen = budgets.reduce((a, b) => a + (b.level === 'over' ? 1 : b.level === 'warn' ? 0.35 : 0), 0);
    parts.budget = 20 * clamp01(1 - pen / budgets.length);
  } else parts.budget = 12;
  if (rule && rule.income > 0) {
    const dev = Math.abs(rule.needPct - 0.5) + Math.abs(rule.wantPct - 0.3) + Math.abs(rule.savePct - 0.2);
    parts.equilibrio = 15 * clamp01(1 - dev / 0.6);
  } else parts.equilibrio = 0;
  parts.debiti = debtOwed <= 0 ? 10 : income > 0 ? 10 * clamp01(1 - debtOwed / income / 3) : 0;
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { score, grade: gradeOf(score), parts };
}

/** Obiettivo di risparmio: importo mensile suggerito */
export function goalPlan(goal, current, todayStr) {
  const target = Number(goal.target) || 0;
  const remaining = round2(Math.max(0, target - current));
  let monthsLeft = null, monthly = null;
  if (goal.targetDate) {
    const t = parseYmd(todayStr), d = parseYmd(goal.targetDate);
    monthsLeft = Math.max(0, (d.getFullYear() - t.getFullYear()) * 12 + (d.getMonth() - t.getMonth()) + (d.getDate() >= t.getDate() ? 0 : -1));
    monthly = remaining > 0 ? round2(remaining / Math.max(1, monthsLeft)) : 0;
  }
  return { remaining, monthsLeft, monthly, pct: target ? clamp01(current / target) : 0 };
}

/** Prossima data di una ricorrenza finanziaria (fine mese "agganciata") */
export function nextDate(dateStr, freq, interval = 1) {
  const d = parseYmd(dateStr);
  const n = Math.max(1, Number(interval) || 1);
  if (freq === 'daily') return ymd(addDays(d, n));
  if (freq === 'weekly') return ymd(addDays(d, 7 * n));
  if (freq === 'yearly') return ymd(addMonths(d, 12 * n));
  return ymd(addMonths(d, n));
}

/** Tutte le date scadute (<= oggi) non ancora registrate */
export function pendingDates(rec, todayStr, max = 24) {
  const out = [];
  let d = rec.nextDate;
  while (d && d <= todayStr && out.length < max) {
    if (rec.endDate && d > rec.endDate) break;
    out.push(d);
    d = nextDate(d, rec.freq, rec.interval);
  }
  return { dates: out, next: d };
}

/** Costo mensile equivalente di un abbonamento */
export function monthlyEquivalent(rec) {
  const a = Number(rec.amount) || 0, n = Number(rec.interval) || 1;
  if (rec.freq === 'daily') return round2((a * 30.44) / n);
  if (rec.freq === 'weekly') return round2((a * 52) / 12 / n);
  if (rec.freq === 'yearly') return round2(a / 12 / n);
  return round2(a / n);
}

/** Suggerisce la categoria usata più spesso con la stessa descrizione */
export function suggestCategory(txs, description) {
  const key = String(description || '').trim().toLowerCase();
  if (key.length < 2) return null;
  const counts = new Map();
  for (const t of txs) {
    if (!t.categoryId || !t.description) continue;
    const d = t.description.toLowerCase();
    if (d === key || d.startsWith(key) || key.startsWith(d)) counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  }
  let best = null, max = 0;
  for (const [k, v] of counts) if (v > max) { best = k; max = v; }
  return best;
}

export const daysUntil = (todayStr, dateStr) => diffDays(parseYmd(todayStr), parseYmd(dateStr));
