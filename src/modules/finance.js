// Modulo Finanze: panoramica, movimenti, budget, pianificazione, conti e categorie
import { db, lookups, settings } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, actionSheet, confirmSheet, toast, openSheet, pageHeader, iconBtn, segmented, swipeRow, progress, empty, pickFile, haptic } from '../core/ui.js';
import { money, moneyShort, pct, num, today, thisMonth, monthLabel, monthShift, fmtDate, relDay, MONTHS, round2 } from '../core/format.js';
import * as F from '../lib/finance.js';
import { donut, bars, line, color } from '../lib/charts.js';
import { saveAttachments, checkBudgets, postRecurringNow } from '../core/money.js';
import { exportTransactionsCsv, importTransactionsCsv } from '../core/backup.js';
import { go } from '../core/router.js';

const SUBS = [{ value: 'panoramica', label: 'Panoramica' }, { value: 'movimenti', label: 'Movimenti' }, { value: 'budget', label: 'Budget' }, { value: 'pianifica', label: 'Pianifica' }, { value: 'conti', label: 'Conti' }];
const state = { month: thisMonth(), q: '', type: 'all', accountId: '', categoryId: '', tag: '' };
const TYPE_LABEL = { expense: 'Uscita', income: 'Entrata', transfer: 'Trasferimento' };

async function load() {
  const [L, txs, budgets, recurring, savings, debts, atts] = await Promise.all([
    lookups(), db.transactions.toArray(), db.budgets.toArray(), db.recurring.toArray(), db.savings.toArray(), db.debts.toArray(),
    db.attachments.where('[ownerType+ownerId]').between(['tx', -Infinity], ['tx', Infinity]).keys()
  ]);
  const withAtt = new Set(atts.map((k) => k[1]));
  return { ...L, txs, budgets, recurring, savings, debts, withAtt };
}

const catLabel = (c, catMap) => (c ? (c.parentId && catMap.get(c.parentId) ? `${catMap.get(c.parentId).name} › ${c.name}` : c.name) : 'Senza categoria');
const catOptions = (categories, kind) => {
  const roots = categories.filter((c) => c.kind === kind && !c.parentId).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const out = [{ value: '', label: '— Nessuna —' }];
  for (const r of roots) {
    out.push({ value: r.id, label: `${r.icon || ''} ${r.name}` });
    for (const s of categories.filter((c) => c.parentId === r.id).sort((a, b) => a.name.localeCompare(b.name, 'it'))) out.push({ value: s.id, label: `\u00a0\u00a0\u00a0↳ ${s.name}` });
  }
  return out;
};
const accOptions = (accounts) => accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.icon || ''} ${a.name}` }));

const monthNav = () => html`<div class="cal-head">${iconBtn('left', 'prevMonth', 'Mese precedente')}<h2>${monthLabel(state.month)}</h2>${iconBtn('right', 'nextMonth', 'Mese successivo')}</div>`;

// ---------- Form movimento (usato anche da "Oggi") ----------
export async function openTxForm(tx = null, preset = {}) {
  const { accounts, categories, catMap } = await lookups();
  const all = await db.transactions.orderBy('date').reverse().limit(800).toArray();
  const descriptions = [...new Set(all.map((t) => t.description).filter(Boolean))].slice(0, 60);
  const v = tx || { type: 'expense', date: today(), accountId: accounts.find((a) => a.type === 'conto')?.id || accounts[0]?.id, ...preset };
  const existing = tx?.id ? await db.attachments.filter((a) => a.ownerType === 'tx' && a.ownerId === tx.id).toArray() : [];
  const extraTop = existing.length ? `<div class="thumbs" style="margin-bottom:14px">${existing.map((a) => `<img data-att="${a.id}" alt="Scontrino" src="${URL.createObjectURL(a.blob)}">`).join('')}</div>` : '';
  const res = await formSheet({
    title: tx?.id ? 'Modifica movimento' : 'Nuovo movimento',
    extraTop,
    values: { ...v, catExp: v.type === 'expense' ? v.categoryId : '', catInc: v.type === 'income' ? v.categoryId : '' },
    deleteLabel: tx?.id ? 'Elimina movimento' : null,
    fields: [
      { name: 'type', type: 'seg', options: [{ value: 'expense', label: 'Uscita' }, { value: 'income', label: 'Entrata' }, { value: 'transfer', label: 'Trasferimento' }] },
      { name: 'amount', label: 'Importo €', type: 'money', required: true, autofocus: !tx?.id, group: 1 },
      { name: 'description', label: 'Descrizione', placeholder: 'es. Supermercato', list: descriptions, group: 1 },
      { name: 'catExp', label: 'Categoria', type: 'select', options: catOptions(categories, 'expense'), showIf: (x) => x.type === 'expense', group: 1 },
      { name: 'catInc', label: 'Categoria', type: 'select', options: catOptions(categories, 'income'), showIf: (x) => x.type === 'income', group: 1 },
      { name: 'accountId', label: 'Conto', type: 'select', options: accOptions(accounts), required: true, group: 2 },
      { name: 'toAccountId', label: 'Verso il conto', type: 'select', options: accOptions(accounts), showIf: (x) => x.type === 'transfer', group: 2 },
      { name: 'date', label: 'Data', type: 'date', required: true, group: 2 },
      { name: 'tags', label: 'Tag', type: 'tags', value: (v.tags || []).join(', '), placeholder: 'vacanza, lavoro', group: 3 },
      { name: 'fixed', label: 'Spesa fissa', type: 'checkbox', showIf: (x) => x.type === 'expense', group: 3 },
      { name: 'note', label: 'Note', type: 'textarea', rows: 2, group: 3 },
      { name: 'photos', label: 'Foto scontrino', type: 'image', group: 4 }
    ],
    validate: (x) => (!(x.amount > 0) ? 'Inserisci un importo maggiore di zero' : x.type === 'transfer' && x.accountId === x.toAccountId ? 'Scegli due conti diversi' : null),
    onMount: ({ form }) => {
      let touched = false;
      form.elements.catExp.addEventListener('change', () => (touched = true));
      form.elements.description.addEventListener('change', () => {
        if (touched || form.elements.type.value === 'transfer') return;
        const id = F.suggestCategory(all, form.elements.description.value);
        if (!id) return;
        const kind = catMap.get(id)?.kind;
        const sel = kind === 'income' ? form.elements.catInc : form.elements.catExp;
        if (sel && !sel.value) { sel.value = String(id); toast(`Categoria suggerita: ${catMap.get(id).name}`, { ms: 1600 }); }
      });
      form.addEventListener('click', async (e) => {
        const img = e.target.closest('[data-att]');
        if (!img) return;
        const choice = await actionSheet('Foto', [{ label: 'Apri a schermo intero', value: 'open' }, { label: 'Elimina foto', value: 'del', danger: true }]);
        if (choice === 'open') openSheet({ title: 'Scontrino', full: true, body: `<img class="receipt" alt="Scontrino" src="${img.src}">` });
        if (choice === 'del') { await db.attachments.delete(Number(img.dataset.att)); img.remove(); }
      });
    }
  });
  if (!res) return false;
  if (res.__delete) {
    await db.transaction('rw', db.transactions, db.attachments, async () => {
      await db.transactions.delete(tx.id);
      await db.attachments.filter((a) => a.ownerType === 'tx' && a.ownerId === tx.id).delete();
    });
    toast('Movimento eliminato');
    return true;
  }
  const rec = {
    ...(tx || {}), type: res.type, amount: round2(res.amount), description: res.description, date: res.date, accountId: res.accountId,
    toAccountId: res.type === 'transfer' ? res.toAccountId : null,
    categoryId: res.type === 'expense' ? res.catExp || null : res.type === 'income' ? res.catInc || null : null,
    tags: res.tags, fixed: res.type === 'expense' && res.fixed, note: res.note, updatedAt: Date.now(), createdAt: tx?.createdAt || Date.now()
  };
  const id = await db.transactions.put(rec);
  if (res.photos?.length) await saveAttachments('tx', id, res.photos);
  toast(tx?.id ? 'Movimento aggiornato' : `${TYPE_LABEL[rec.type]} di ${money(rec.amount)} salvata`);
  if (rec.type === 'expense') checkBudgets(rec.date);
  return true;
}

// ---------- Viste ----------
function overview(d) {
  const t = today();
  const mtx = F.inMonth(d.txs, state.month);
  const st = F.monthStats(d.txs, state.month, t);
  const cmp = F.compareMonths(d.txs, state.month);
  const total = F.totalBalance(d.accounts, d.txs);
  const balances = F.accountBalances(d.accounts, d.txs);
  const liquid = d.accounts.filter((a) => !a.archived && a.liquid !== false).reduce((a, x) => a + (balances.get(x.id) || 0), 0);
  const avgExp = F.avgMonthlyExpense(d.txs, state.month);
  const emerg = F.emergencyMonths(liquid, avgExp);
  const rule = F.rule503020(mtx, d.categories);
  const bstat = F.budgetStatus(d.budgets, d.txs, d.categories, state.month);
  const owed = d.debts.filter((x) => !x.settled && x.direction === 'owe').reduce((a, x) => a + Number(x.amount), 0);
  const health = F.healthScore({ income: st.income, savingsRate: st.savingsRate, emergency: emerg, emergencyTarget: settings.emergencyTarget, budgets: bstat, rule, debtOwed: owed });
  const fv = F.fixedVsVariable(mtx, d.categories);
  const cats = F.byCategory(mtx, d.categories);
  const top = cats.slice(0, 6).map((c, i) => ({ label: c.category.name, value: c.value, color: c.category.color || color(i), icon: c.category.icon }));
  const series = F.monthlySeries(d.txs, state.month, 6);
  const trend = F.balanceTrend(d.accounts, d.txs, state.month, 12);
  const partsLabel = { risparmio: ['Tasso di risparmio', 30], emergenza: ['Fondo emergenza', 25], budget: ['Rispetto budget', 20], equilibrio: ['Equilibrio 50/30/20', 15], debiti: ['Debiti', 10] };
  const alerts = bstat.filter((b) => b.level !== 'ok');
  return html`${monthNav()}
  <div class="card"><h3>Saldo totale <a href="#/finanze/conti">Conti</a></h3><div class="big-num">${money(total)}</div>
    <div class="chips hscroll" style="margin-top:10px">${d.accounts.filter((a) => !a.archived).map((a) => html`<span class="chip">${a.icon} ${a.name}: <b>${moneyShort(balances.get(a.id))}</b></span>`)}</div></div>
  ${alerts.length ? html`<a class="banner warn" href="#/finanze/budget"><span>⚠️</span><p>${alerts.map((a) => `${a.category?.name || ''} ${Math.round(a.pct * 100)}%`).join(' · ')}</p></a>` : ''}
  <div class="grid2 wide" style="margin-top:12px">
    <div class="card stat"><div class="l">Entrate</div><div class="v pos">${money(st.income)}</div></div>
    <div class="card stat"><div class="l">Uscite</div><div class="v">${money(st.expense)}</div></div>
    <div class="card stat"><div class="l">Risparmio del mese</div><div class="v ${st.net >= 0 ? 'pos' : 'neg'}">${money(st.net)}</div></div>
    <div class="card stat"><div class="l">Tasso di risparmio</div><div class="v">${pct(st.savingsRate)}</div></div>
    <div class="card stat"><div class="l">Media giornaliera</div><div class="v">${money(st.dailyAvg)}</div></div>
    <div class="card stat"><div class="l">Previsione uscite a fine mese</div><div class="v">${money(st.forecastExpense)}</div></div>
    <div class="card stat"><div class="l">Uscite vs mese prima</div><div class="v ${cmp.expenseDelta > 0 ? 'neg' : 'pos'}">${cmp.prev.expense ? `${cmp.expenseDelta > 0 ? '+' : ''}${pct(cmp.expenseDelta)}` : '–'}</div></div>
    <div class="card stat"><div class="l">Fisse / variabili</div><div class="v">${moneyShort(fv.fixed)} / ${moneyShort(fv.variable)}</div></div>
  </div>
  <h2 class="section-title">Salute finanziaria</h2>
  <div class="card">
    <div class="donut-wrap"><div class="grade grade-${health.grade}" aria-label="Grado ${health.grade}">${health.grade}</div>
      <div><div class="big-num">${health.score}<small class="muted">/100</small></div><div class="muted small">Fondo emergenza: ${emerg >= 99 ? '∞' : num(emerg, 1)} mesi di spese (obiettivo ${settings.emergencyTarget})</div></div></div>
    ${Object.entries(health.parts).map(([k, v]) => html`<div class="kv"><span>${partsLabel[k][0]}</span><span class="muted">${num(v, 0)}/${partsLabel[k][1]}</span></div>${progress(v / partsLabel[k][1], v / partsLabel[k][1] > 0.7 ? 'good' : v / partsLabel[k][1] < 0.35 ? 'over' : 'warn')}`)}
  </div>
  <div class="card"><h3>Regola 50/30/20</h3>
    ${[['Necessità', rule.need, rule.needPct, 0.5], ['Desideri', rule.want, rule.wantPct, 0.3], ['Risparmio', rule.save, rule.savePct, 0.2]].map(([l, v, p, target]) => html`<div class="kv"><span>${l} · ${money(v)}</span><span class="muted">${pct(p)} (obiettivo ${pct(target)})</span></div>${progress(p / (target * 2), l === 'Risparmio' ? (p >= target ? 'good' : 'warn') : (p > target ? 'over' : 'good'))}`)}
    <p class="caption" style="margin:8px 0 0">Assegna “Necessità / Desideri / Risparmio” a ogni categoria in Conti → Categorie.</p>
  </div>
  <h2 class="section-title">Dove vanno i soldi</h2>
  <div class="card">${top.length ? html`<div class="donut-wrap">${raw(donut(top, { center: moneyShort(st.expense), sub: 'uscite' }))}<div class="legend">${top.map((x, i) => html`<div><i class="dot" style="background:${x.color || color(i)}"></i>${x.icon} ${x.label}<span class="n">${moneyShort(x.value)}</span></div>`)}</div></div>` : empty('🍩', 'Nessuna uscita in questo mese')}</div>
  <div class="card"><h3>Entrate e uscite (6 mesi)</h3>${raw(bars(series.map((s) => MONTHS[Number(s.ym.slice(5)) - 1].slice(0, 3)), [{ name: 'Entrate', color: 'var(--green)', values: series.map((s) => s.income) }, { name: 'Uscite', color: 'var(--red)', values: series.map((s) => s.expense) }], { fmt: money }))}</div>
  <div class="card"><h3>Andamento saldo (12 mesi)</h3>${raw(line(trend.map((x) => MONTHS[Number(x.ym.slice(5)) - 1].slice(0, 3)), trend.map((x) => x.value), { fmt: money }))}</div>`;
}

function filtered(d) {
  const q = state.q.trim().toLowerCase();
  let list = q ? d.txs : F.inMonth(d.txs, state.month);
  if (state.type !== 'all') list = list.filter((t) => t.type === state.type);
  if (state.accountId) list = list.filter((t) => t.accountId === Number(state.accountId) || t.toAccountId === Number(state.accountId));
  if (state.categoryId) list = list.filter((t) => t.categoryId === Number(state.categoryId) || d.catMap.get(t.categoryId)?.parentId === Number(state.categoryId));
  if (state.tag) list = list.filter((t) => (t.tags || []).includes(state.tag));
  if (q) list = list.filter((t) => [t.description, t.note, ...(t.tags || []), d.catMap.get(t.categoryId)?.name, String(t.amount).replace('.', ',')].join(' ').toLowerCase().includes(q));
  return list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}

function txRow(t, d) {
  const c = d.catMap.get(t.categoryId);
  const icon = t.type === 'transfer' ? '🔁' : c?.icon || (t.type === 'income' ? '💰' : '💸');
  const title = t.description || (t.type === 'transfer' ? `${d.accMap.get(t.accountId)?.name || ''} → ${d.accMap.get(t.toAccountId)?.name || ''}` : c?.name || TYPE_LABEL[t.type]);
  const sub = [t.type === 'transfer' ? 'Trasferimento' : catLabel(c, d.catMap), d.accMap.get(t.accountId)?.name, ...(t.tags || []).map((x) => '#' + x)].filter(Boolean).join(' · ');
  const amt = t.type === 'expense' ? `−${money(t.amount)}` : t.type === 'income' ? `+${money(t.amount)}` : money(t.amount);
  return swipeRow(
    html`<button class="row has-ic" data-act="editTx" data-id="${t.id}"><span class="row-ic" style="background:${c?.color ? c.color + '33' : 'var(--fill)'}">${icon}</span><span class="row-main"><strong>${title}${d.withAtt.has(t.id) ? ' 📎' : ''}</strong><small>${sub}</small></span><span class="row-end ${t.type === 'income' ? 'pos' : 'neg'}">${amt}</span></button>`,
    html`<button class="info" data-act="dupTx" data-id="${t.id}">Duplica</button><button data-act="delTx" data-id="${t.id}">Elimina</button>`
  );
}

function movements(d) {
  const list = filtered(d);
  const byDay = new Map();
  for (const t of list) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
  const tags = [...new Set(d.txs.flatMap((t) => t.tags || []))].sort();
  const sum = F.summarize(list);
  const activeFilters = [state.accountId && d.accMap.get(Number(state.accountId))?.name, state.categoryId && d.catMap.get(Number(state.categoryId))?.name, state.tag && '#' + state.tag].filter(Boolean);
  return html`${state.q ? '' : monthNav()}
  <label class="search-box">${icon('search')}<input type="search" placeholder="Cerca in tutti i movimenti" value="${state.q}" data-search enterkeyhint="search" aria-label="Cerca movimenti"></label>
  <div class="chips hscroll" style="margin-bottom:12px">
    ${[['all', 'Tutti'], ['expense', 'Uscite'], ['income', 'Entrate'], ['transfer', 'Trasferimenti']].map(([v, l]) => html`<button class="chip ${state.type === v ? 'on' : ''}" data-act="type" data-value="${v}">${l}</button>`)}
    <button class="chip ${activeFilters.length ? 'on' : ''}" data-act="filters">${icon('filter')} ${activeFilters.length ? activeFilters.join(', ') : 'Filtri'}</button>
  </div>
  <div class="kv"><span class="muted">${list.length} movimenti</span><span><span style="color:var(--green)">+${money(sum.income)}</span> · −${money(sum.expense)}</span></div>
  ${list.length ? [...byDay.entries()].map(([day, items]) => html`<div class="group-label">${relDay(day)} · ${fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}</div><div class="list">${items.map((t) => txRow(t, d))}</div>`) : empty('🧾', state.q ? 'Nessun risultato' : 'Nessun movimento in questo mese', html`<button class="btn filled" data-act="addTx">Aggiungi movimento</button>`)}
  <div class="btn-row" style="margin-top:20px"><button class="btn" data-act="exportCsv">${icon('down')} Esporta CSV</button><button class="btn" data-act="importCsv">${icon('up')} Importa CSV</button></div>
  <p class="caption">Lo scorrimento a sinistra su un movimento mostra Duplica ed Elimina.</p>`;
}

function budgetView(d) {
  const st = F.budgetStatus(d.budgets, d.txs, d.categories, state.month);
  const byCat = new Map(st.map((s) => [s.budget.categoryId, s]));
  const roots = d.categories.filter((c) => c.kind === 'expense' && !c.parentId);
  const spentBy = new Map(F.byCategory(F.inMonth(d.txs, state.month), d.categories).map((x) => [x.id, x.value]));
  const totB = st.reduce((a, s) => a + s.budget.amount, 0), totS = st.reduce((a, s) => a + s.spent, 0);
  return html`${monthNav()}
  ${st.length ? html`<div class="card"><h3>Totale budget</h3><div class="kv"><b>${money(totS)}</b><span class="muted">di ${money(totB)}</span></div>${progress(totS / (totB || 1), totS > totB ? 'over' : totS > totB * 0.8 ? 'warn' : '')}</div>` : html`<div class="banner"><span>💡</span><p>Tocca una categoria per impostare un budget mensile. Ricevi un avviso all’80% e al 100%.</p></div>`}
  <div class="list" style="margin-top:14px">${roots.map((c) => {
    const s = byCat.get(c.id);
    return html`<button class="row has-ic" data-act="setBudget" data-id="${c.id}"><span class="row-ic" style="background:${c.color}33">${c.icon}</span><span class="row-main"><strong>${c.name}</strong>${s ? html`${progress(s.pct, s.level === 'ok' ? '' : s.level)}<small>${money(s.spent)} di ${money(s.budget.amount)} · ${s.left >= 0 ? `restano ${money(s.left)}` : `oltre di ${money(-s.left)}`}</small>` : html`<small>Speso ${money(spentBy.get(c.id) || 0)} · nessun budget</small>`}</span>${icon('chev', 'chev')}</button>`;
  })}</div>`;
}

function planView(d) {
  const t = today();
  const pending = d.recurring.filter((r) => r.active !== false && !r.autoPost && r.nextDate && r.nextDate <= t);
  const subs = d.recurring.filter((r) => r.active !== false && r.type !== 'income');
  const monthlyCost = subs.reduce((a, r) => a + F.monthlyEquivalent(r), 0);
  const balances = F.accountBalances(d.accounts, d.txs);
  const owedToMe = d.debts.filter((x) => !x.settled && x.direction === 'owed').reduce((a, x) => a + Number(x.amount), 0);
  const iOwe = d.debts.filter((x) => !x.settled && x.direction === 'owe').reduce((a, x) => a + Number(x.amount), 0);
  const freqLabel = { daily: 'giorno', weekly: 'settimana', monthly: 'mese', yearly: 'anno' };
  return html`
  ${pending.length ? html`<h2 class="section-title">Da registrare</h2><div class="list">${pending.map((r) => html`<div class="row has-ic"><span class="row-ic">⏰</span><span class="row-main"><strong>${r.title}</strong><small>${relDay(r.nextDate)} · ${money(r.amount)}</small></span><button class="btn small filled" data-act="postRec" data-id="${r.id}">Registra</button></div>`)}</div>` : ''}
  <h2 class="section-title">Ricorrenti e abbonamenti <button class="link" data-act="addRec">Aggiungi</button></h2>
  ${d.recurring.length ? html`<div class="card" style="margin-bottom:10px"><div class="kv"><span>Costo mensile equivalente</span><b>${money(monthlyCost)}</b></div><div class="kv"><span class="muted">All’anno</span><span class="muted">${money(monthlyCost * 12)}</span></div></div>
  <div class="list">${d.recurring.sort((a, b) => (a.nextDate || '').localeCompare(b.nextDate || '')).map((r) => swipeRow(html`<button class="row has-ic" data-act="editRec" data-id="${r.id}"><span class="row-ic">${r.isSubscription ? '📺' : r.type === 'income' ? '💼' : '🔁'}</span><span class="row-main"><strong>${r.title}${r.active === false ? ' (in pausa)' : ''}</strong><small>Ogni ${r.interval > 1 ? r.interval + ' ' : ''}${freqLabel[r.freq]} · prossima ${r.nextDate ? fmtDate(r.nextDate) : '–'}${r.autoPost ? ' · automatica' : ''}</small></span><span class="row-end">${money(r.amount)}</span></button>`, html`<button data-act="delRec" data-id="${r.id}">Elimina</button>`))}</div>` : empty('🔁', 'Affitto, stipendio, abbonamenti: aggiungili una volta e Vita li ricorda per te')}
  <h2 class="section-title">Obiettivi di risparmio <button class="link" data-act="addSaving">Aggiungi</button></h2>
  ${d.savings.length ? html`<div class="list">${d.savings.map((s) => {
    const current = s.accountId ? Math.max(0, balances.get(s.accountId) || 0) : Number(s.saved) || 0;
    const p = F.goalPlan(s, current, t);
    return html`<button class="row has-ic" data-act="editSaving" data-id="${s.id}"><span class="row-ic">${s.icon || '🎯'}</span><span class="row-main wrap"><strong>${s.name}</strong>${progress(p.pct, p.pct >= 1 ? 'good' : '')}<small>${money(current)} di ${money(s.target)}${p.monthly != null && p.remaining > 0 ? ` · metti da parte ${money(p.monthly)}/mese per ${p.monthsLeft} mesi` : p.remaining <= 0 ? ' · raggiunto 🎉' : ''}${s.accountId ? ` · conto ${d.accMap.get(s.accountId)?.name || ''}` : ''}</small></span></button>`;
  })}</div>` : empty('🐷', 'Viaggio, auto, fondo emergenza: crea un obiettivo e collegalo a un conto')}
  <h2 class="section-title">Debiti e crediti <button class="link" data-act="addDebt">Aggiungi</button></h2>
  <div class="grid2"><div class="card stat"><div class="l">Mi devono</div><div class="v pos">${money(owedToMe)}</div></div><div class="card stat"><div class="l">Devo</div><div class="v neg">${money(iOwe)}</div></div></div>
  ${d.debts.length ? html`<div class="list" style="margin-top:12px">${d.debts.sort((a, b) => a.settled - b.settled || (a.dueDate || '9').localeCompare(b.dueDate || '9')).map((x) => swipeRow(html`<button class="row has-ic ${x.settled ? 'done' : ''}" data-act="editDebt" data-id="${x.id}"><span class="row-ic">${x.direction === 'owed' ? '📥' : '📤'}</span><span class="row-main"><strong>${x.person}</strong><small>${x.direction === 'owed' ? 'Mi deve' : 'Gli devo'}${x.dueDate ? ` · entro ${fmtDate(x.dueDate)}` : ''}${x.note ? ` · ${x.note}` : ''}</small></span><span class="row-end ${x.direction === 'owed' ? 'pos' : ''}">${money(x.amount)}</span></button>`, html`<button class="alt" data-act="settleDebt" data-id="${x.id}">${x.settled ? 'Riapri' : 'Saldato'}</button><button data-act="delDebt" data-id="${x.id}">Elimina</button>`))}</div>` : ''}`;
}

function accountsView(d) {
  const bal = F.accountBalances(d.accounts, d.txs);
  const roots = (kind) => d.categories.filter((c) => c.kind === kind && !c.parentId).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const groupLabel = { need: 'Necessità', want: 'Desideri', save: 'Risparmio' };
  const catList = (kind) => html`<div class="list">${roots(kind).map((c) => html`<button class="row has-ic" data-act="editCat" data-id="${c.id}"><span class="row-ic" style="background:${c.color}33">${c.icon}</span><span class="row-main"><strong>${c.name}</strong><small>${[kind === 'expense' ? groupLabel[c.group] : '', c.fixed ? 'fissa' : '', d.categories.filter((s) => s.parentId === c.id).map((s) => s.name).join(', ')].filter(Boolean).join(' · ') || 'Nessuna sottocategoria'}</small></span>${icon('chev', 'chev')}</button>`)}</div>`;
  return html`<h2 class="section-title">Conti <button class="link" data-act="addAcc">Aggiungi</button></h2>
  <div class="list">${d.accounts.map((a) => html`<button class="row has-ic" data-act="editAcc" data-id="${a.id}"><span class="row-ic" style="background:${a.color}33">${a.icon}</span><span class="row-main"><strong>${a.name}${a.archived ? ' (archiviato)' : ''}</strong><small>${a.type}${a.liquid === false ? ' · non liquido' : ''}</small></span><span class="row-end">${money(bal.get(a.id))}</span></button>`)}</div>
  <h2 class="section-title">Categorie di spesa <button class="link" data-act="addCat" data-kind="expense">Aggiungi</button></h2>${catList('expense')}
  <h2 class="section-title">Categorie di entrata <button class="link" data-act="addCat" data-kind="income">Aggiungi</button></h2>${catList('income')}
  <h2 class="section-title">Dati</h2>
  <div class="list"><button class="row" data-act="exportCsv">${icon('down')}<span class="row-main">Esporta movimenti in CSV</span></button><button class="row" data-act="importCsv">${icon('up')}<span class="row-main"><strong>Importa movimenti da CSV</strong><small>Colonne: data; importo; descrizione; categoria; conto; tipo; tag; note</small></span></button></div>`;
}

// ---------- Render ----------
export async function render(root, route, ctx) {
  const sub = SUBS.some((s) => s.value === route.sub) ? route.sub : 'panoramica';
  const d = await load();
  const body = { panoramica: overview, movimenti: movements, budget: budgetView, pianifica: planView, conti: accountsView }[sub](d);
  root.innerHTML = String(html`${pageHeader('Finanze', { right: html`${iconBtn('search', 'goSearch', 'Cerca movimenti')}${iconBtn('plus', 'addTx', 'Nuovo movimento')}` })}
    <main class="page"><div class="seg-wrap">${segmented(SUBS, sub, 'sub')}</div>${body}</main>`);
  const refresh = () => ctx.rerender();
  const search = root.querySelector('[data-search]');
  if (search) {
    let tm;
    search.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { state.q = search.value; refresh(); }, 350); });
    if (state.q) setTimeout(() => { search.focus(); search.setSelectionRange(99, 99); }, 50);
  }
  return bindActions(root, {
    sub: ({ value }) => go(`#/finanze/${value}`),
    prevMonth: () => { state.month = monthShift(state.month, -1); refresh(); },
    nextMonth: () => { state.month = monthShift(state.month, 1); refresh(); },
    goSearch: () => { go('#/finanze/movimenti'); setTimeout(() => document.querySelector('[data-search]')?.focus(), 200); },
    addTx: async () => { if (await openTxForm()) refresh(); },
    editTx: async ({ id }) => { if (await openTxForm(await db.transactions.get(Number(id)))) refresh(); },
    dupTx: async ({ id }) => { const t = await db.transactions.get(Number(id)); delete t.id; t.date = today(); t.createdAt = Date.now(); delete t.recurringId; await db.transactions.add(t); toast('Duplicato con data di oggi'); refresh(); },
    delTx: async ({ id }) => {
      const t = await db.transactions.get(Number(id));
      await db.transactions.delete(Number(id));
      toast('Movimento eliminato', { action: { label: 'Annulla', run: async () => { await db.transactions.put(t); refresh(); } } });
      refresh();
    },
    type: ({ value }) => { state.type = value; refresh(); },
    filters: async () => {
      const tags = [...new Set(d.txs.flatMap((t) => t.tags || []))].sort();
      const r = await formSheet({
        title: 'Filtri', submitLabel: 'Applica', values: state,
        fields: [
          { name: 'accountId', label: 'Conto', type: 'select', options: [{ value: '', label: 'Tutti' }, ...accOptions(d.accounts)] },
          { name: 'categoryId', label: 'Categoria', type: 'select', options: [{ value: '', label: 'Tutte' }, ...catOptions(d.categories, 'expense').slice(1), ...catOptions(d.categories, 'income').slice(1)] },
          { name: 'tag', label: 'Tag', type: 'select', options: [{ value: '', label: 'Tutti' }, ...tags.map((x) => ({ value: x, label: '#' + x }))] }
        ]
      });
      if (r) { Object.assign(state, { accountId: r.accountId || '', categoryId: r.categoryId || '', tag: r.tag || '' }); refresh(); }
    },
    exportCsv: () => { const ids = sub === 'movimenti' ? new Set(filtered(d).map((t) => t.id)) : null; return exportTransactionsCsv(ids ? (t) => ids.has(t.id) : null); },
    importCsv: async () => {
      const f = await pickFile('.csv,text/csv,text/plain');
      if (!f) return;
      const r = await importTransactionsCsv(await f.text());
      toast(`Importati ${r.added} movimenti${r.skipped ? `, ${r.skipped} righe ignorate` : ''}`);
      refresh();
    },
    setBudget: async ({ id }) => {
      const c = d.catMap.get(Number(id));
      const b = d.budgets.find((x) => x.categoryId === c.id);
      const r = await formSheet({ title: `Budget ${c.name}`, values: { amount: b?.amount ?? '' }, fields: [{ name: 'amount', label: 'Importo mensile €', type: 'money', autofocus: true, help: 'Lascia vuoto per rimuovere il budget' }] });
      if (!r) return;
      if (!r.amount) { if (b) await db.budgets.delete(b.id); }
      else await db.budgets.put({ ...(b || {}), categoryId: c.id, amount: round2(r.amount) });
      refresh();
    },
    addRec: async () => { if (await recForm(null, d)) refresh(); },
    editRec: async ({ id }) => { if (await recForm(await db.recurring.get(Number(id)), d)) refresh(); },
    delRec: async ({ id }) => { if (await confirmSheet('Eliminare la ricorrenza?', { okLabel: 'Elimina', danger: true, detail: 'I movimenti già registrati restano.' })) { await db.recurring.delete(Number(id)); refresh(); } },
    postRec: async ({ id }) => { await postRecurringNow(await db.recurring.get(Number(id))); haptic(); toast('Registrato'); refresh(); },
    addSaving: async () => { if (await savingForm(null, d)) refresh(); },
    editSaving: async ({ id }) => { if (await savingForm(await db.savings.get(Number(id)), d)) refresh(); },
    addDebt: async () => { if (await debtForm()) refresh(); },
    editDebt: async ({ id }) => { if (await debtForm(await db.debts.get(Number(id)))) refresh(); },
    settleDebt: async ({ id }) => { const x = await db.debts.get(Number(id)); await db.debts.update(x.id, { settled: !x.settled }); refresh(); },
    delDebt: async ({ id }) => { await db.debts.delete(Number(id)); refresh(); },
    addAcc: async () => { if (await accForm()) refresh(); },
    editAcc: async ({ id }) => { if (await accForm(await db.accounts.get(Number(id)), d)) refresh(); },
    addCat: async ({ kind }) => { if (await catForm(null, kind, d)) refresh(); },
    editCat: async ({ id }) => { if (await catForm(await db.categories.get(Number(id)), null, d)) refresh(); }
  });
}

// ---------- Form secondari ----------
async function recForm(r, d) {
  const v = r || { type: 'expense', freq: 'monthly', interval: 1, nextDate: today(), autoPost: false, remindDaysBefore: 1, active: true, accountId: d.accounts[1]?.id || d.accounts[0]?.id };
  const res = await formSheet({
    title: r ? 'Modifica ricorrenza' : 'Nuova ricorrenza', values: { ...v, catExp: v.type === 'expense' ? v.categoryId : '', catInc: v.type === 'income' ? v.categoryId : '' }, deleteLabel: r ? 'Elimina ricorrenza' : null,
    fields: [
      { name: 'type', type: 'seg', options: [{ value: 'expense', label: 'Uscita' }, { value: 'income', label: 'Entrata' }] },
      { name: 'title', label: 'Nome', required: true, placeholder: 'es. Netflix, Affitto', autofocus: !r, group: 1 },
      { name: 'amount', label: 'Importo €', type: 'money', required: true, group: 1 },
      { name: 'catExp', label: 'Categoria', type: 'select', options: catOptions(d.categories, 'expense'), showIf: (x) => x.type === 'expense', group: 1 },
      { name: 'catInc', label: 'Categoria', type: 'select', options: catOptions(d.categories, 'income'), showIf: (x) => x.type === 'income', group: 1 },
      { name: 'accountId', label: 'Conto', type: 'select', options: accOptions(d.accounts), group: 1 },
      { name: 'freq', label: 'Frequenza', type: 'select', options: [{ value: 'monthly', label: 'Mensile' }, { value: 'weekly', label: 'Settimanale' }, { value: 'yearly', label: 'Annuale' }, { value: 'daily', label: 'Giornaliera' }], group: 2 },
      { name: 'interval', label: 'Ogni (n periodi)', type: 'number', min: 1, step: 1, group: 2 },
      { name: 'nextDate', label: 'Prossima scadenza', type: 'date', required: true, group: 2 },
      { name: 'endDate', label: 'Fine (opzionale)', type: 'date', group: 2 },
      { name: 'isSubscription', label: 'È un abbonamento', type: 'checkbox', group: 3 },
      { name: 'autoPost', label: 'Registra in automatico', type: 'checkbox', help: 'Altrimenti compare in “Da registrare” il giorno della scadenza.', group: 3 },
      { name: 'remindDaysBefore', label: 'Avvisami giorni prima', type: 'number', min: 0, step: 1, group: 3 },
      { name: 'active', label: 'Attiva', type: 'checkbox', group: 3 }
    ],
    validate: (x) => (!(x.amount > 0) ? 'Importo non valido' : null)
  });
  if (!res) return false;
  if (res.__delete) { await db.recurring.delete(r.id); return true; }
  const { catExp, catInc, ...rest } = res;
  await db.recurring.put({ ...(r || {}), ...rest, interval: Math.max(1, res.interval || 1), amount: round2(res.amount), categoryId: res.type === 'expense' ? catExp || null : catInc || null });
  return true;
}

async function savingForm(s, d) {
  const res = await formSheet({
    title: s ? 'Obiettivo di risparmio' : 'Nuovo obiettivo', values: s || { icon: '🎯' }, deleteLabel: s ? 'Elimina obiettivo' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !s, placeholder: 'es. Vacanza in Giappone' },
      { name: 'icon', label: 'Emoji' },
      { name: 'target', label: 'Importo obiettivo €', type: 'money', required: true },
      { name: 'targetDate', label: 'Entro il', type: 'date' },
      { name: 'accountId', label: 'Conto collegato', type: 'select', options: [{ value: '', label: 'Nessuno (importo manuale)' }, ...accOptions(d.accounts)], group: 1 },
      { name: 'saved', label: 'Già risparmiato €', type: 'money', showIf: (x) => !x.accountId, group: 1 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.savings.delete(s.id); return true; }
  await db.savings.put({ ...(s || {}), ...res, accountId: res.accountId || null, saved: res.saved || 0 });
  return true;
}

async function debtForm(x) {
  const res = await formSheet({
    title: x ? 'Modifica' : 'Debito o credito', values: x || { direction: 'owed' }, deleteLabel: x ? 'Elimina' : null,
    fields: [
      { name: 'direction', type: 'seg', options: [{ value: 'owed', label: 'Mi deve' }, { value: 'owe', label: 'Gli devo' }] },
      { name: 'person', label: 'Persona', required: true, autofocus: !x, group: 1 },
      { name: 'amount', label: 'Importo €', type: 'money', required: true, group: 1 },
      { name: 'dueDate', label: 'Scadenza', type: 'date', group: 1 },
      { name: 'note', label: 'Per cosa', group: 1 },
      { name: 'settled', label: 'Saldato', type: 'checkbox', group: 2 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.debts.delete(x.id); return true; }
  await db.debts.put({ ...(x || {}), ...res, amount: round2(res.amount), createdAt: x?.createdAt || Date.now() });
  return true;
}

async function accForm(a, d) {
  const res = await formSheet({
    title: a ? 'Modifica conto' : 'Nuovo conto', values: a || { type: 'conto', icon: '💳', color: '#0a84ff', initial: 0, liquid: true }, deleteLabel: a ? 'Elimina conto' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !a },
      { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'contanti', label: 'Contanti' }, { value: 'conto', label: 'Conto corrente' }, { value: 'carta', label: 'Carta' }, { value: 'risparmio', label: 'Risparmio' }, { value: 'investimenti', label: 'Investimenti' }] },
      { name: 'icon', label: 'Emoji' },
      { name: 'color', label: 'Colore', type: 'color' },
      { name: 'initial', label: 'Saldo iniziale €', type: 'money', help: 'Il saldo che avevi prima del primo movimento registrato.' },
      { name: 'liquid', label: 'Disponibile per emergenze', type: 'checkbox', group: 1 },
      { name: 'archived', label: 'Archiviato', type: 'checkbox', group: 1 }
    ]
  });
  if (!res) return false;
  if (res.__delete) {
    const used = await db.transactions.filter((t) => t.accountId === a.id || t.toAccountId === a.id).count();
    if (used) { toast(`Conto usato in ${used} movimenti: archivialo invece di eliminarlo`, { type: 'error' }); return false; }
    await db.accounts.delete(a.id); return true;
  }
  await db.accounts.put({ ...(a || {}), ...res, initial: Number.isNaN(res.initial) || res.initial == null ? 0 : res.initial });
  return true;
}

async function catForm(c, kind, d) {
  kind = c?.kind || kind;
  const subs = c ? d.categories.filter((s) => s.parentId === c.id) : [];
  const res = await formSheet({
    title: c ? 'Categoria' : 'Nuova categoria', values: c ? { ...c, subs: subs.map((s) => s.name).join(', ') } : { icon: '🏷️', color: '#8e8e93', group: 'want' }, deleteLabel: c ? 'Elimina categoria' : null,
    fields: [
      { name: 'name', label: 'Nome', required: true, autofocus: !c },
      { name: 'icon', label: 'Emoji' },
      { name: 'color', label: 'Colore', type: 'color' },
      ...(kind === 'expense' ? [{ name: 'group', label: 'Tipo (50/30/20)', type: 'select', options: [{ value: 'need', label: 'Necessità' }, { value: 'want', label: 'Desideri' }, { value: 'save', label: 'Risparmio' }] }, { name: 'fixed', label: 'Spesa fissa', type: 'checkbox' }] : []),
      { name: 'subs', label: 'Sottocategorie (separate da virgola)', type: 'textarea', rows: 2, group: 1 }
    ]
  });
  if (!res) return false;
  if (res.__delete) {
    const used = await db.transactions.filter((t) => t.categoryId === c.id || subs.some((s) => s.id === t.categoryId)).count();
    if (used && !(await confirmSheet(`Categoria usata in ${used} movimenti`, { okLabel: 'Elimina comunque', danger: true, detail: 'I movimenti resteranno senza categoria.' }))) return false;
    await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
      const ids = [c.id, ...subs.map((s) => s.id)];
      await db.transactions.filter((t) => ids.includes(t.categoryId)).modify({ categoryId: null });
      await db.categories.bulkDelete(ids);
      await db.budgets.where('categoryId').anyOf(ids).delete();
    });
    return true;
  }
  const { subs: subText, ...rest } = res;
  const id = await db.categories.put({ ...(c || {}), ...rest, kind, parentId: c?.parentId || null });
  const wanted = (subText || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of wanted) if (!subs.some((s) => s.name === name)) await db.categories.add({ kind, name, icon: rest.icon, color: rest.color, group: rest.group, fixed: rest.fixed, parentId: id });
  for (const s of subs) if (!wanted.includes(s.name)) {
    const used = await db.transactions.where('categoryId').equals(s.id).count();
    if (used) await db.transactions.where('categoryId').equals(s.id).modify({ categoryId: id });
    await db.categories.delete(s.id);
  }
  return true;
}
