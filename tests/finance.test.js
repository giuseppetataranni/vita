import { describe, it, expect } from 'vitest';
import { accountBalances, monthStats, budgetStatus, rule503020, healthScore, goalPlan, nextDate, pendingDates, monthlyEquivalent, byCategory, suggestCategory, fixedVsVariable, emergencyMonths } from '../src/lib/finance.js';
import { parseAmount } from '../src/core/format.js';

const accounts = [{ id: 1, name: 'Carta', initial: 1000 }, { id: 2, name: 'Risparmio', initial: 500 }];
const cats = [
  { id: 10, name: 'Casa', kind: 'expense', group: 'need', fixed: true },
  { id: 11, name: 'Affitto', kind: 'expense', parentId: 10 },
  { id: 20, name: 'Svago', kind: 'expense', group: 'want' },
  { id: 30, name: 'Stipendio', kind: 'income' }
];
const txs = [
  { date: '2026-11-01', type: 'income', amount: 2000, accountId: 1, categoryId: 30 },
  { date: '2026-11-02', type: 'expense', amount: 800, accountId: 1, categoryId: 11 },
  { date: '2026-11-05', type: 'expense', amount: 150.5, accountId: 1, categoryId: 20, description: 'Cinema' },
  { date: '2026-11-06', type: 'transfer', amount: 300, accountId: 1, toAccountId: 2 },
  { date: '2026-10-10', type: 'expense', amount: 100, accountId: 1, categoryId: 20, description: 'Cinema' }
];

describe('finanze', () => {
  it('saldi dei conti con trasferimenti', () => {
    const b = accountBalances(accounts, txs);
    expect(b.get(1)).toBe(1000 + 2000 - 800 - 150.5 - 300 - 100);
    expect(b.get(2)).toBe(800);
  });
  it('statistiche del mese e previsione', () => {
    const s = monthStats(txs, '2026-11', '2026-11-15');
    expect(s.income).toBe(2000);
    expect(s.expense).toBe(950.5);
    expect(s.dailyAvg).toBeCloseTo(63.37, 2);
    expect(s.forecastExpense).toBeCloseTo(1901, 0);
    expect(s.savingsRate).toBeCloseTo(0.52475, 4);
  });
  it('budget con sottocategorie e soglie', () => {
    const r = budgetStatus([{ categoryId: 10, amount: 900 }, { categoryId: 20, amount: 100 }], txs, cats, '2026-11');
    expect(r.find((x) => x.budget.categoryId === 10).level).toBe('warn');
    expect(r.find((x) => x.budget.categoryId === 20).level).toBe('over');
  });
  it('regola 50/30/20', () => {
    const r = rule503020(txs.filter((t) => t.date.startsWith('2026-11')), cats);
    expect(r.need).toBe(800);
    expect(r.want).toBe(150.5);
    expect(r.save).toBe(1049.5);
  });
  it('categorie aggregate al padre', () => {
    const r = byCategory(txs.filter((t) => t.date.startsWith('2026-11')), cats);
    expect(r[0].id).toBe(10);
  });
  it('fissi vs variabili', () => {
    const r = fixedVsVariable(txs.filter((t) => t.date.startsWith('2026-11')), cats);
    expect(r).toEqual({ fixed: 800, variable: 150.5 });
  });
  it('punteggio salute e grado', () => {
    const h = healthScore({ income: 2000, savingsRate: 0.25, emergency: 6, budgets: [], rule: { income: 2000, needPct: 0.5, wantPct: 0.3, savePct: 0.2 }, debtOwed: 0 });
    expect(h.score).toBe(92);
    expect(h.grade).toBe('A');
    expect(healthScore({ income: 0, savingsRate: 0, emergency: 0 }).grade).toBe('E');
  });
  it('fondo emergenza', () => {
    expect(emergencyMonths(3000, 1000)).toBe(3);
  });
  it('obiettivo di risparmio', () => {
    const p = goalPlan({ target: 1200, targetDate: '2027-11-18' }, 0, '2026-11-18');
    expect(p.monthsLeft).toBe(12);
    expect(p.monthly).toBe(100);
  });
  it('ricorrenze mensili agganciate a fine mese', () => {
    expect(nextDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextDate('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(nextDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    const p = pendingDates({ nextDate: '2026-09-10', freq: 'monthly', interval: 1 }, '2026-11-18');
    expect(p.dates).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
    expect(p.next).toBe('2026-12-10');
  });
  it('costo mensile equivalente', () => {
    expect(monthlyEquivalent({ amount: 120, freq: 'yearly' })).toBe(10);
    expect(monthlyEquivalent({ amount: 10, freq: 'weekly' })).toBeCloseTo(43.33, 2);
  });
  it('categoria suggerita', () => {
    expect(suggestCategory(txs, 'cinema')).toBe(20);
  });
  it('importi in formato italiano', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('€ 7.50')).toBe(7.5);
    expect(parseAmount('1.000.000')).toBe(1000000);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });
});
