// Ricerca globale in tutta l'app
import { db, lookups } from '../core/db.js';
import { html, raw, icon, pageHeader, empty } from '../core/ui.js';
import { money, fmtDate, parseLocal, fmtDay } from '../core/format.js';
import { highlight } from './journal.js';
import { QUOTES } from '../data/quotes.js';

let lastQ = '';
async function search(q) {
  const s = q.toLowerCase();
  const has = (...xs) => xs.filter(Boolean).join(' ').toLowerCase().includes(s);
  const { catMap, calMap } = await lookups();
  const [txs, events, notes, journal, goals, routines, learning, recurring, debts, quotes] = await Promise.all([
    db.transactions.toArray(), db.events.toArray(), db.notes.toArray(), db.journal.toArray(), db.goals.toArray(), db.routines.toArray(), db.learning.toArray(), db.recurring.toArray(), db.debts.toArray(), db.quotes.toArray()
  ]);
  const groups = [];
  const push = (title, items) => items.length && groups.push({ title, items: items.slice(0, 25), more: Math.max(0, items.length - 25) });
  push('Movimenti', txs.filter((t) => has(t.description, t.note, ...(t.tags || []), catMap.get(t.categoryId)?.name, String(t.amount).replace('.', ','))).sort((a, b) => b.date.localeCompare(a.date)).map((t) => ({ href: '#/finanze/movimenti', title: t.description || catMap.get(t.categoryId)?.name || 'Movimento', sub: `${fmtDate(t.date)} · ${t.type === 'expense' ? '−' : '+'}${money(t.amount)}`, icon: catMap.get(t.categoryId)?.icon || '💶' })));
  push('Eventi', events.filter((e) => has(e.title, e.location, e.notes)).sort((a, b) => b.start.localeCompare(a.start)).map((e) => ({ href: '#/calendario/agenda', title: e.title, sub: `${fmtDay(parseLocal(e.start))} · ${calMap.get(e.calendarId)?.name || ''}`, icon: '📅' })));
  push('Note e liste', notes.filter((n) => has(n.title, n.text, ...(n.items || []).map((i) => i.text))).map((n) => ({ href: n.kind === 'list' ? '#/note/liste' : '#/note', title: n.title || 'Nota', sub: n.kind === 'list' ? 'Lista' : (n.text || '').slice(0, 80), icon: n.kind === 'list' ? '📋' : '🗒️' })));
  push('Diario', journal.filter((j) => has(j.title, j.text, ...(j.tags || []))).map((j) => ({ href: '#/diario', title: j.title || fmtDate(j.date), sub: (j.text || '').slice(0, 90), icon: '📔' })));
  push('Obiettivi', goals.filter((g) => has(g.title, g.why, ...(g.milestones || []).map((m) => m.text))).map((g) => ({ href: '#/routine/obiettivi', title: g.title, sub: g.deadline ? `Entro ${fmtDate(g.deadline)}` : '', icon: '🎯' })));
  push('Routine', routines.filter((r) => has(r.name, ...(r.items || []).map((i) => i.text))).map((r) => ({ href: '#/routine', title: r.name, sub: `${(r.items || []).length} attività`, icon: r.emoji || '✅' })));
  push('Da imparare', learning.filter((l) => has(l.title, l.author, l.notes)).map((l) => ({ href: '#/note/imparare', title: l.title, sub: `${l.status} · ${l.progress || 0}%`, icon: '🎓' })));
  push('Ricorrenti e debiti', [...recurring.filter((r) => has(r.title)).map((r) => ({ href: '#/finanze/pianifica', title: r.title, sub: money(r.amount), icon: '🔁' })), ...debts.filter((d) => has(d.person, d.note)).map((d) => ({ href: '#/finanze/pianifica', title: d.person, sub: money(d.amount), icon: '🤝' }))]);
  push('Frasi', [...QUOTES.map((x) => ({ text: x[0], author: x[1] })), ...quotes].filter((x) => has(x.text, x.author)).map((x) => ({ href: '#/mente/frasi', title: x.text, sub: x.author || '', icon: '💬' })));
  return groups;
}

export async function render(root) {
  const draw = async (q) => {
    const res = root.querySelector('[data-res]');
    if (q.trim().length < 2) { res.innerHTML = String(empty('🔎', 'Cerca tra movimenti, eventi, note, diario, obiettivi, routine e frasi')); return; }
    const groups = await search(q.trim());
    res.innerHTML = groups.length ? String(html`${groups.map((g) => html`<div class="group-label">${g.title}${g.more ? ` (+${g.more})` : ''}</div><div class="list">${g.items.map((i) => html`<a class="row has-ic" href="${i.href}"><span class="row-ic">${i.icon}</span><span class="row-main"><strong>${raw(highlight(i.title, q.trim()))}</strong>${i.sub ? html`<small>${raw(highlight(i.sub, q.trim()))}</small>` : ''}</span></a>`)}</div>`)}`) : String(empty('🤷', 'Nessun risultato'));
  };
  root.innerHTML = String(html`${pageHeader('Cerca', { back: { href: '#/altro', label: 'Altro' } })}<main class="page"><label class="search-box">${icon('search')}<input type="search" placeholder="Cerca in tutta l’app" value="${lastQ}" data-q autofocus aria-label="Cerca in tutta l’app" enterkeyhint="search"></label><div data-res></div></main>`);
  const inp = root.querySelector('[data-q]');
  let t;
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { lastQ = inp.value; draw(inp.value); }, 250); });
  draw(lastQ);
  setTimeout(() => inp.focus(), 300);
}
