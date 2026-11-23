// Servizi finanziari condivisi: ricorrenze automatiche, avvisi budget, allegati
import { db, getMeta, setMeta, lookups } from './db.js';
import { pendingDates, budgetStatus } from '../lib/finance.js';
import { today, money, thisMonth } from './format.js';
import { toast, compressImage } from './ui.js';

/** Registra automaticamente le ricorrenze scadute con "registra in automatico" */
export async function processRecurring() {
  const t = today();
  const recs = await db.recurring.filter((r) => r.active !== false && r.nextDate && r.nextDate <= t).toArray();
  const manual = [];
  for (const r of recs) {
    if (!r.autoPost) { manual.push(r); continue; }
    const { dates, next } = pendingDates(r, t);
    await db.transaction('rw', db.transactions, db.recurring, async () => {
      for (const d of dates) await db.transactions.add(txFromRecurring(r, d));
      await db.recurring.update(r.id, { nextDate: next, ...(r.endDate && next > r.endDate ? { active: false } : {}) });
    });
  }
  return manual;
}
export const txFromRecurring = (r, date) => ({ date, type: r.type || 'expense', amount: r.amount, accountId: r.accountId, toAccountId: r.toAccountId || null, categoryId: r.categoryId, description: r.title, tags: r.isSubscription ? ['abbonamento'] : [], note: '', fixed: true, recurringId: r.id, createdAt: Date.now() });

export async function postRecurringNow(r, date = r.nextDate) {
  const { next } = pendingDates({ ...r, nextDate: date }, date, 1);
  await db.transactions.add(txFromRecurring(r, date));
  await db.recurring.update(r.id, { nextDate: next });
}

export async function saveAttachments(ownerType, ownerId, files) {
  for (const f of files || []) {
    const blob = await compressImage(f);
    await db.attachments.add({ ownerType, ownerId, blob, mime: blob.type, name: f.name, createdAt: Date.now() });
  }
}

/** Avvisi al superamento dell'80% e del 100% del budget (una volta per mese e categoria) */
export async function checkBudgets(date = today()) {
  const ym = date.slice(0, 7);
  if (ym !== thisMonth()) return;
  const [budgets, txs, { categories }] = await Promise.all([db.budgets.toArray(), db.transactions.where('date').startsWith(ym).toArray(), lookups()]);
  for (const s of budgetStatus(budgets, txs, categories, ym)) {
    if (s.level === 'ok') continue;
    const key = `budgetAlert:${ym}:${s.budget.categoryId}:${s.level}`;
    if (await getMeta(key)) continue;
    await setMeta(key, true);
    const name = s.category?.name || 'categoria';
    const msg = s.level === 'over' ? `Budget “${name}” superato: ${money(s.spent)} su ${money(s.budget.amount)}` : `Budget “${name}” all’${Math.round(s.pct * 100)}%: restano ${money(s.left)}`;
    toast(msg, { type: s.level === 'over' ? 'error' : 'warn', ms: 4500 });
  }
}
