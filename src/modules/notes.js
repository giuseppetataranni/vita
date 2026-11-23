// Note rapide, liste (spesa, da leggere, da guardare…) e percorso di apprendimento
import { db } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, toast, openSheet, pageHeader, iconBtn, segmented, swipeRow, progress, empty, haptic, actionSheet } from '../core/ui.js';
import { uid, relDay, ymd } from '../core/format.js';
import { go } from '../core/router.js';

const SUBS = [{ value: 'note', label: 'Note' }, { value: 'liste', label: 'Liste' }, { value: 'imparare', label: 'Da imparare' }];
const LIST_TYPES = { spesa: '🛒 Spesa', leggere: '📖 Da leggere', guardare: '🎬 Da guardare', todo: '✅ Da fare', altro: '📝 Altro' };
const LEARN_TYPES = { libro: '📘', corso: '🎓', articolo: '📰', video: '▶️', podcast: '🎧', lingua: '🗣️', altro: '✨' };
const state = { q: '' };

export async function openNoteForm(n = null, preset = {}) {
  const res = await formSheet({
    title: n ? 'Nota' : 'Nuova nota', values: n || { pinned: false, ...preset }, deleteLabel: n ? 'Elimina nota' : null,
    fields: [
      { name: 'title', label: 'Titolo', autofocus: !n },
      { name: 'text', label: 'Testo', type: 'textarea', rows: 8 },
      { name: 'pinned', label: 'Fissa in alto', type: 'checkbox', group: 1 }
    ],
    validate: (x) => (!x.title && !x.text ? 'Scrivi qualcosa' : null)
  });
  if (!res) return false;
  if (res.__delete) { await db.notes.delete(n.id); toast('Nota eliminata'); return true; }
  await db.notes.put({ ...(n || { kind: 'note', createdAt: Date.now() }), ...res, pinned: res.pinned ? 1 : 0, updatedAt: Date.now() });
  toast('Nota salvata');
  return true;
}

async function listSheet(id) {
  const draw = async (el) => {
    const l = await db.notes.get(id);
    const items = l.items || [];
    el.querySelector('.sheet-body').innerHTML = String(html`
      <form class="search-box" data-add style="background:var(--bg2)">${icon('plus')}<input name="t" placeholder="Aggiungi elemento" enterkeyhint="done" autocomplete="off" aria-label="Nuovo elemento"></form>
      ${items.length ? html`<div class="list">${items.map((i) => swipeRow(html`<button class="row ${i.done ? 'done' : ''}" data-i="${i.id}" role="checkbox" aria-checked="${!!i.done}"><span class="check ${i.done ? 'on' : ''}">${i.done ? icon('check') : ''}</span><span class="row-main wrap"><strong>${i.text}</strong></span></button>`, html`<button data-del="${i.id}">Elimina</button>`))}</div>` : empty('📝', 'Lista vuota')}
      ${items.some((i) => i.done) ? html`<button class="btn block" data-clear>Rimuovi completati</button>` : ''}
      <button class="btn block" data-share>${icon('share')} Condividi lista</button>`);
    const inp = el.querySelector('[name="t"]');
    el.querySelector('[data-add]').onsubmit = async (e) => {
      e.preventDefault();
      const t = inp.value.trim();
      if (!t) return;
      const cur = await db.notes.get(id);
      await db.notes.update(id, { items: [...(cur.items || []), ...t.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((text) => ({ id: uid(), text, done: false }))], updatedAt: Date.now() });
      await draw(el);
      el.querySelector('[name="t"]').focus();
    };
  };
  return openSheet({
    title: (await db.notes.get(id)).title, full: true,
    onMount: async ({ el }) => {
      await draw(el);
      el.addEventListener('click', async (e) => {
        const cur = await db.notes.get(id);
        const it = e.target.closest('[data-i]'), del = e.target.closest('[data-del]');
        if (del) { await db.notes.update(id, { items: cur.items.filter((x) => x.id !== del.dataset.del) }); return draw(el); }
        if (it) {
          haptic();
          const items = cur.items.map((x) => (x.id === it.dataset.i ? { ...x, done: !x.done } : x));
          items.sort((a, b) => a.done - b.done);
          await db.notes.update(id, { items, updatedAt: Date.now() }); return draw(el);
        }
        if (e.target.closest('[data-clear]')) { await db.notes.update(id, { items: cur.items.filter((x) => !x.done) }); return draw(el); }
        if (e.target.closest('[data-share]')) {
          const text = `${cur.title}\n${cur.items.map((x) => `${x.done ? '☑︎' : '☐'} ${x.text}`).join('\n')}`;
          if (navigator.share) navigator.share({ text }).catch(() => {}); else { await navigator.clipboard?.writeText(text); toast('Copiata negli appunti'); }
        }
      });
    }
  });
}

async function notesView() {
  const q = state.q.toLowerCase();
  let notes = await db.notes.where('kind').equals('note').toArray();
  if (q) notes = notes.filter((n) => `${n.title} ${n.text}`.toLowerCase().includes(q));
  notes.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || b.updatedAt - a.updatedAt);
  return html`<label class="search-box">${icon('search')}<input type="search" placeholder="Cerca nelle note" value="${state.q}" data-search aria-label="Cerca nelle note"></label>
  ${notes.length ? html`<div class="note-grid">${notes.map((n) => html`<button class="note-card" data-act="edit" data-id="${n.id}"><h4>${n.pinned ? '📌 ' : ''}${n.title || 'Senza titolo'}</h4><p>${n.text || ''}</p><small class="muted">${relDay(ymd(new Date(n.updatedAt)))}</small></button>`)}</div>` : empty('🗒️', q ? 'Nessuna nota trovata' : 'Annota idee, numeri, cose da ricordare', html`<button class="btn filled" data-act="add">Nuova nota</button>`)}`;
}

async function listsView() {
  const lists = await db.notes.where('kind').equals('list').toArray();
  lists.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || b.updatedAt - a.updatedAt);
  return html`${lists.length ? html`<div class="list">${lists.map((l) => { const open = (l.items || []).filter((i) => !i.done).length; return swipeRow(html`<button class="row has-ic" data-act="openList" data-id="${l.id}"><span class="row-ic">${(LIST_TYPES[l.listType] || '📝').split(' ')[0]}</span><span class="row-main"><strong>${l.pinned ? '📌 ' : ''}${l.title}</strong><small>${open} da fare · ${(l.items || []).length} totali</small></span>${icon('chev', 'chev')}</button>`, html`<button class="alt" data-act="pinList" data-id="${l.id}">${l.pinned ? 'Sblocca' : 'Fissa'}</button><button data-act="delList" data-id="${l.id}">Elimina</button>`); })}</div>` : empty('📋', 'Crea una lista della spesa, dei libri o dei film')}
  <div class="chips" style="margin-top:14px">${Object.entries(LIST_TYPES).map(([k, l]) => html`<button class="chip" data-act="newList" data-type="${k}">+ ${l}</button>`)}</div>`;
}

async function learnView() {
  const items = await db.learning.toArray();
  const order = { 'in corso': 0, 'da fare': 1, finito: 2 };
  items.sort((a, b) => order[a.status] - order[b.status] || (b.updatedAt || 0) - (a.updatedAt || 0));
  const done = items.filter((i) => i.status === 'finito').length;
  return html`${items.length ? html`<div class="kv"><span class="muted">${done} completati su ${items.length}</span></div><div class="list">${items.map((i) => swipeRow(html`<button class="row has-ic" data-act="editLearn" data-id="${i.id}"><span class="row-ic">${LEARN_TYPES[i.type] || '✨'}</span><span class="row-main wrap"><strong>${i.title}</strong>${progress((i.progress || 0) / 100, i.status === 'finito' ? 'good' : '')}<small>${i.status} · ${i.progress || 0}%${i.author ? ` · ${i.author}` : ''}</small></span></button>`, html`<button class="alt" data-act="plus10" data-id="${i.id}">+10%</button><button data-act="delLearn" data-id="${i.id}">Elimina</button>`))}</div>` : empty('🎓', 'Libri, corsi, lingue: tieni traccia di cosa stai imparando')}
  <button class="btn block" data-act="addLearn">${icon('plus')} Aggiungi</button>`;
}

async function learnForm(i = null) {
  const res = await formSheet({
    title: i ? 'Modifica' : 'Da imparare', values: i || { type: 'libro', status: 'da fare', progress: 0 }, deleteLabel: i ? 'Elimina' : null,
    fields: [
      { name: 'title', label: 'Titolo', required: true, autofocus: !i },
      { name: 'author', label: 'Autore / fonte' },
      { name: 'type', label: 'Tipo', type: 'select', options: Object.entries(LEARN_TYPES).map(([k, e]) => ({ value: k, label: `${e} ${k}` })) },
      { name: 'status', label: 'Stato', type: 'select', options: ['da fare', 'in corso', 'finito'].map((x) => ({ value: x, label: x })) },
      { name: 'progress', label: 'Avanzamento %', type: 'number', min: 0, max: 100, step: 5 },
      { name: 'link', label: 'Link', type: 'url', group: 1 },
      { name: 'notes', label: 'Appunti', type: 'textarea', rows: 4, group: 1 }
    ]
  });
  if (!res) return false;
  if (res.__delete) { await db.learning.delete(i.id); return true; }
  const progressV = Math.max(0, Math.min(100, res.progress || 0));
  await db.learning.put({ ...(i || { createdAt: Date.now() }), ...res, progress: progressV, status: progressV >= 100 ? 'finito' : res.status, updatedAt: Date.now() });
  return true;
}

export async function render(root, route, ctx) {
  const sub = SUBS.some((s) => s.value === route.sub) ? route.sub : 'note';
  const body = await { note: notesView, liste: listsView, imparare: learnView }[sub]();
  root.innerHTML = String(html`${pageHeader('Note e liste', { back: { href: '#/altro', label: 'Altro' }, right: iconBtn('plus', sub === 'note' ? 'add' : sub === 'liste' ? 'newList' : 'addLearn', 'Aggiungi') })}<main class="page"><div class="seg-wrap">${segmented(SUBS, sub, 'sub')}</div>${body}</main>`);
  const refresh = () => ctx.rerender();
  const s = root.querySelector('[data-search]');
  if (s) { let t; s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = s.value; refresh(); }, 300); }); if (state.q) setTimeout(() => s.focus(), 50); }
  return bindActions(root, {
    sub: ({ value }) => go(`#/note/${value}`),
    add: async () => { if (await openNoteForm()) refresh(); },
    edit: async ({ id }) => { if (await openNoteForm(await db.notes.get(Number(id)))) refresh(); },
    newList: async ({ type }) => {
      const t = type || (await actionSheet('Tipo di lista', Object.entries(LIST_TYPES).map(([k, l]) => ({ value: k, label: l }))));
      if (!t) return;
      const r = await formSheet({ title: 'Nuova lista', values: { title: LIST_TYPES[t].split(' ').slice(1).join(' ') }, fields: [{ name: 'title', label: 'Nome', required: true, autofocus: true }] });
      if (!r) return;
      const id = await db.notes.add({ kind: 'list', listType: t, title: r.title, items: [], pinned: 0, createdAt: Date.now(), updatedAt: Date.now() });
      await listSheet(id); refresh();
    },
    openList: async ({ id }) => { await listSheet(Number(id)); refresh(); },
    pinList: async ({ id }) => { const l = await db.notes.get(Number(id)); await db.notes.update(l.id, { pinned: l.pinned ? 0 : 1 }); refresh(); },
    delList: async ({ id }) => { const l = await db.notes.get(Number(id)); await db.notes.delete(l.id); toast('Lista eliminata', { action: { label: 'Annulla', run: async () => { await db.notes.put(l); refresh(); } } }); refresh(); },
    addLearn: async () => { if (await learnForm()) refresh(); },
    editLearn: async ({ id }) => { if (await learnForm(await db.learning.get(Number(id)))) refresh(); },
    plus10: async ({ id }) => { const i = await db.learning.get(Number(id)); const p = Math.min(100, (i.progress || 0) + 10); await db.learning.update(i.id, { progress: p, status: p >= 100 ? 'finito' : 'in corso', updatedAt: Date.now() }); haptic(); refresh(); },
    delLearn: async ({ id }) => { await db.learning.delete(Number(id)); refresh(); }
  });
}
