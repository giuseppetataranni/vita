// Diario giornaliero con tag e ricerca full-text
import { db } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, toast, pageHeader, iconBtn, empty } from '../core/ui.js';
import { today, fmtDate, relDay } from '../core/format.js';
import { MOODS } from './mind.js';

const state = { q: '', tag: '' };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const highlight = (text, q) => {
  const safe = esc(text);
  if (!q) return safe;
  return safe.replace(new RegExp(reEsc(esc(q)), 'gi'), (m) => `<mark>${m}</mark>`);
};
function snippet(text, q, len = 180) {
  if (!q) return text.length > len ? text.slice(0, len) + '…' : text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, len);
  const s = Math.max(0, i - 60);
  return (s ? '…' : '') + text.slice(s, s + len) + (s + len < text.length ? '…' : '');
}

export async function openJournalForm(e = null, preset = {}) {
  const mood = e ? e.mood : (await db.moods.get(today()))?.value;
  const res = await formSheet({
    title: e ? 'Voce del diario' : 'Nuova voce', values: e ? { ...e } : { date: today(), mood: mood || '', ...preset }, deleteLabel: e ? 'Elimina voce' : null,
    fields: [
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'title', label: 'Titolo', placeholder: 'Facoltativo' },
      { name: 'mood', label: 'Umore', type: 'select', options: [{ value: '', label: '—' }, ...MOODS.map((m, i) => ({ value: i + 1, label: `${m} ${i + 1}` }))] },
      { name: 'text', label: 'Cosa vuoi ricordare di oggi?', type: 'textarea', rows: 10, required: true, autofocus: !e, group: 1 },
      { name: 'tags', label: 'Tag', type: 'tags', value: (e?.tags || []).join(', '), placeholder: 'lavoro, famiglia', group: 2 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.journal.delete(e.id); toast('Voce eliminata'); return true; }
  await db.journal.put({ ...(e || { createdAt: Date.now() }), ...res, mood: res.mood || null, tags: res.tags.map((t) => t.toLowerCase()), updatedAt: Date.now() });
  toast('Salvato nel diario');
  return true;
}

export async function render(root, route, ctx) {
  let entries = await db.journal.orderBy('date').reverse().toArray();
  const tags = [...new Set(entries.flatMap((e) => e.tags || []))].sort();
  const q = state.q.trim();
  if (state.tag) entries = entries.filter((e) => (e.tags || []).includes(state.tag));
  if (q) entries = entries.filter((e) => `${e.title} ${e.text} ${(e.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  root.innerHTML = String(html`${pageHeader('Diario', { back: { href: '#/altro', label: 'Altro' }, right: iconBtn('plus', 'add', 'Nuova voce') })}<main class="page">
    <label class="search-box">${icon('search')}<input type="search" placeholder="Cerca nel diario" value="${state.q}" data-search aria-label="Cerca nel diario"></label>
    ${tags.length ? html`<div class="chips hscroll" style="margin-bottom:12px"><button class="chip ${!state.tag ? 'on' : ''}" data-act="tag" data-t="">Tutti</button>${tags.map((t) => html`<button class="chip ${state.tag === t ? 'on' : ''}" data-act="tag" data-t="${t}">#${t}</button>`)}</div>` : ''}
    ${entries.length ? html`<div class="list">${entries.map((e) => html`<button class="row" data-act="edit" data-id="${e.id}"><span class="row-main wrap"><strong>${e.mood ? MOODS[e.mood - 1] + ' ' : ''}${raw(highlight(e.title || fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' }), q))}</strong><small style="white-space:normal">${raw(highlight(snippet(e.text || '', q), q))}</small><small>${relDay(e.date)} ${(e.tags || []).map((t) => html`<span class="tag">#${t}</span>`)}</small></span></button>`)}</div>`
      : empty('📔', q || state.tag ? 'Nessuna voce trovata' : 'Scrivi qualche riga ogni sera: tra un anno sarà un tesoro', html`<button class="btn filled" data-act="add">Scrivi oggi</button>`)}
  </main>`);
  const refresh = () => ctx.rerender();
  const s = root.querySelector('[data-search]');
  let t;
  s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = s.value; refresh(); }, 300); });
  if (state.q) setTimeout(() => { s.focus(); s.setSelectionRange(99, 99); }, 50);
  return bindActions(root, {
    add: async () => { if (await openJournalForm()) refresh(); },
    edit: async ({ id }) => { if (await openJournalForm(await db.journal.get(Number(id)))) refresh(); },
    tag: ({ t: tag }) => { state.tag = tag; refresh(); }
  });
}
