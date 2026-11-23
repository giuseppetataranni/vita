// Componenti UI: template sicuri, bottom sheet, form, toast, swipe, feedback aptico
import { parseAmount } from './format.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
const val = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));
/** Template HTML con escape automatico dei valori interpolati */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Icone (stile SF, tratto) ----------
const P = {
  oggi: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  finanze: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  routine: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  altro: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  share: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  down: '<path d="M12 4v12M7.5 11.5L12 16l4.5-4.5M5 20h14"/>',
  up: '<path d="M12 20V8M7.5 12.5L12 8l4.5 4.5M5 4h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 13a8 8 0 0 0 14.3 4.5L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1.5M15 9v1.5M12 9v4h-1M9.5 16a4 4 0 0 0 5 0"/>'
};
export const icon = (name, cls = '') => raw(`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);

// ---------- Feedback aptico (iOS 18+: switch nativo) + visivo ----------
let hapticLabel = null;
export function haptic() {
  try {
    if (!hapticLabel) {
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.id = 'haptic-switch'; inp.hidden = true; inp.tabIndex = -1;
      const lab = document.createElement('label');
      lab.htmlFor = 'haptic-switch'; lab.hidden = true;
      document.body.append(inp, lab);
      hapticLabel = lab;
    }
    hapticLabel.click();
  } catch { /* nessun feedback disponibile */ }
  if (navigator.vibrate) navigator.vibrate(8);
}
export function pulse(el) {
  if (!el) return;
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

// ---------- Toast ----------
export function toast(msg, { type = 'info', ms = 2600, action = null } = {}) {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="toast-btn">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.run(); t.remove(); };
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Bottom sheet ----------
let sheetDepth = 0;
export function openSheet({ title = '', body = '', onMount, full = false, right = null, cancel = 'Chiudi' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.style.zIndex = String(100 + sheetDepth++);
    wrap.innerHTML = `<div class="sheet-backdrop"></div>
      <section class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grab" aria-hidden="true"></div>
        <header class="sheet-head">
          <button type="button" class="link" data-sheet-close>${esc(cancel)}</button>
          <h2>${esc(title)}</h2>
          ${right ? `<button type="button" class="link strong" data-sheet-right>${esc(right)}</button>` : '<span></span>'}
        </header>
        <div class="sheet-body">${body}</div>
      </section>`;
    document.body.append(wrap);
    document.body.classList.add('noscroll');
    const sheet = wrap.querySelector('.sheet');
    let done = false;
    const close = (value = null) => {
      if (done) return; done = true;
      sheetDepth--;
      wrap.classList.remove('open');
      setTimeout(() => { wrap.remove(); if (!document.querySelector('.sheet-wrap')) document.body.classList.remove('noscroll'); }, 280);
      resolve(value);
    };
    wrap.querySelector('.sheet-backdrop').onclick = () => close(null);
    wrap.querySelector('[data-sheet-close]').onclick = () => close(null);
    // Trascina verso il basso per chiudere
    let y0 = null, dy = 0;
    const head = wrap.querySelector('.sheet-head'), grab = wrap.querySelector('.sheet-grab');
    for (const h of [head, grab]) {
      h.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; sheet.style.transition = 'none'; }, { passive: true });
      h.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
      h.addEventListener('touchend', () => { sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 110) close(null); y0 = null; dy = 0; });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    const api = { el: sheet, body: sheet.querySelector('.sheet-body'), close, rightBtn: wrap.querySelector('[data-sheet-right]') };
    onMount && onMount(api);
    setTimeout(() => { const f = sheet.querySelector('[autofocus]'); if (f) f.focus(); }, 320);
  });
}

// ---------- Form generico in bottom sheet ----------
function fieldHtml(f, v) {
  const id = `f_${f.name}`;
  const req = f.required ? 'required' : '';
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
  const af = f.autofocus ? 'autofocus' : '';
  const value = v ?? f.value ?? '';
  let input = '';
  switch (f.type) {
    case 'textarea':
      return `<div class="field full" data-field="${f.name}"><label for="${id}">${esc(f.label)}</label><textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" ${ph} ${req} ${af}>${esc(value)}</textarea>${f.help ? `<small>${esc(f.help)}</small>` : ''}</div>`;
    case 'select':
      input = `<select id="${id}" name="${f.name}" ${req}>${(f.options || []).map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      break;
    case 'seg':
      return `<div class="field full" data-field="${f.name}">${f.label ? `<label>${esc(f.label)}</label>` : ''}<div class="seg" role="radiogroup">${f.options.map((o) => `<button type="button" role="radio" aria-checked="${String(o.value) === String(value)}" class="${String(o.value) === String(value) ? 'on' : ''}" data-seg="${f.name}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div><input type="hidden" name="${f.name}" value="${esc(value)}"></div>`;
    case 'checkbox':
      return `<div class="field" data-field="${f.name}"><label for="${id}">${esc(f.label)}</label><input type="checkbox" switch class="switch" id="${id}" name="${f.name}" ${value ? 'checked' : ''}></div>${f.help ? `<div class="field-help">${esc(f.help)}</div>` : ''}`;
    case 'chips': {
      const sel = new Set((Array.isArray(value) ? value : []).map(String));
      return `<div class="field full" data-field="${f.name}"><label>${esc(f.label)}</label><div class="chips" data-chips="${f.name}">${f.options.map((o) => `<button type="button" class="chip ${sel.has(String(o.value)) ? 'on' : ''}" aria-pressed="${sel.has(String(o.value))}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div></div>`;
    }
    case 'image':
      return `<div class="field full" data-field="${f.name}"><label>${esc(f.label)}</label><label class="btn tinted file-btn">${icon('camera')}<span>Scatta o scegli foto</span><input type="file" accept="image/*" name="${f.name}" hidden></label><div class="thumbs" data-thumbs="${f.name}"></div></div>`;
    case 'color':
      input = `<input type="color" id="${id}" name="${f.name}" value="${esc(value || '#0a84ff')}">`;
      break;
    case 'money':
      input = `<input id="${id}" name="${f.name}" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${value === '' || value == null ? '' : esc(String(value).replace('.', ','))}" ${ph || 'placeholder="0,00"'} ${req} ${af}>`;
      break;
    case 'number':
      input = `<input id="${id}" name="${f.name}" type="number" inputmode="decimal" value="${esc(value)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} step="${f.step || 'any'}" ${ph} ${req} ${af}>`;
      break;
    default:
      input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(value)}" ${ph} ${req} ${af} ${f.list ? `list="${id}_list"` : ''} autocomplete="off">${f.list ? `<datalist id="${id}_list">${f.list.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
  }
  return `<div class="field" data-field="${f.name}"><label for="${id}">${esc(f.label)}</label>${input}</div>${f.help ? `<div class="field-help">${esc(f.help)}</div>` : ''}`;
}

/**
 * fields: [{name,label,type,value,options,required,showIf:(vals)=>bool,group}]
 * Ritorna i valori, null se annullato, {__delete:true} se eliminato.
 */
export function formSheet({ title, fields, values = {}, submitLabel = 'Salva', deleteLabel = null, extraTop = '', onMount: extraMount, validate }) {
  const groups = [];
  for (const f of fields) {
    const g = f.group ?? 0;
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  }
  const body = `<form class="form" novalidate>${extraTop}${groups.filter(Boolean).map((g) => `<div class="group">${g.map((f) => fieldHtml(f, values[f.name])).join('')}</div>`).join('')}
    ${deleteLabel ? `<button type="button" class="btn danger block" data-delete>${esc(deleteLabel)}</button>` : ''}
    <button type="submit" class="sr-only">${esc(submitLabel)}</button></form>`;
  const files = {};
  return openSheet({
    title, body, right: submitLabel, cancel: 'Annulla',
    onMount: ({ el, close, rightBtn }) => {
      const form = el.querySelector('form');
      const collect = () => {
        const out = {};
        for (const f of fields) {
          if (f.type === 'image') { out[f.name] = files[f.name] || []; continue; }
          if (f.type === 'chips') { out[f.name] = $$(`[data-chips="${f.name}"] .chip.on`, form).map((b) => coerce(f, b.dataset.value)); continue; }
          const inp = form.elements[f.name];
          if (!inp) continue;
          if (f.type === 'checkbox') out[f.name] = inp.checked;
          else if (f.type === 'money') out[f.name] = parseAmount(inp.value);
          else if (f.type === 'number') out[f.name] = inp.value === '' ? null : Number(inp.value);
          else if (f.type === 'tags') out[f.name] = inp.value.split(/[,#]/).map((s) => s.trim()).filter(Boolean);
          else if (f.type === 'select' || f.type === 'seg') out[f.name] = coerce(f, inp.value);
          else out[f.name] = typeof inp.value === 'string' ? inp.value.trim() : inp.value;
        }
        return out;
      };
      const refresh = () => {
        const v = collect();
        for (const f of fields) if (f.showIf) {
          const show = !!f.showIf(v);
          $$(`[data-field="${f.name}"]`, form).forEach((n) => { n.hidden = !show; const h = n.nextElementSibling; if (h && h.classList.contains('field-help')) h.hidden = !show; });
        }
      };
      form.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-seg]');
        if (seg) {
          $$(`[data-seg="${seg.dataset.seg}"]`, form).forEach((b) => { b.classList.toggle('on', b === seg); b.setAttribute('aria-checked', String(b === seg)); });
          form.elements[seg.dataset.seg].value = seg.dataset.value;
          haptic(); refresh();
          form.dispatchEvent(new CustomEvent('segchange', { detail: { name: seg.dataset.seg, value: seg.dataset.value } }));
        }
        const chip = e.target.closest('[data-chips] .chip');
        if (chip) { chip.classList.toggle('on'); chip.setAttribute('aria-pressed', String(chip.classList.contains('on'))); haptic(); }
      });
      form.addEventListener('change', (e) => {
        if (e.target.type === 'file' && e.target.files.length) {
          const name = e.target.name;
          files[name] = [...(files[name] || []), ...e.target.files];
          const th = $(`[data-thumbs="${name}"]`, form);
          th.innerHTML = files[name].map((f) => `<img alt="Anteprima foto" src="${URL.createObjectURL(f)}">`).join('');
        }
        refresh();
      });
      form.addEventListener('input', refresh);
      const submit = (e) => {
        e && e.preventDefault();
        const v = collect();
        for (const f of fields) {
          const node = $(`[data-field="${f.name}"]`, form);
          if (node && node.hidden) continue;
          const bad = f.required && (v[f.name] === '' || v[f.name] == null || (typeof v[f.name] === 'number' && Number.isNaN(v[f.name])));
          const nan = (f.type === 'money') && v[f.name] != null && Number.isNaN(v[f.name]) && form.elements[f.name].value.trim() !== '';
          if (bad || nan) {
            node && node.classList.add('invalid');
            toast(`Controlla il campo “${f.label}”`, { type: 'error' });
            const inp = form.elements[f.name]; inp && inp.focus && inp.focus();
            return;
          }
          node && node.classList.remove('invalid');
          if (f.type === 'money' && Number.isNaN(v[f.name])) v[f.name] = null;
        }
        const err = validate && validate(v);
        if (err) { toast(err, { type: 'error' }); return; }
        haptic();
        close(v);
      };
      form.addEventListener('submit', submit);
      rightBtn.onclick = submit;
      const del = form.querySelector('[data-delete]');
      if (del) del.onclick = async () => { if (await confirmSheet('Eliminare definitivamente?', { okLabel: 'Elimina', danger: true })) close({ __delete: true }); };
      refresh();
      extraMount && extraMount({ form, el, close, collect, refresh });
    }
  });
}
function coerce(f, v) {
  const opt = (f.options || []).find((o) => String(o.value) === String(v));
  return opt ? opt.value : v;
}

export function confirmSheet(message, { okLabel = 'Conferma', danger = false, detail = '' } = {}) {
  return openSheet({
    title: '', cancel: 'Annulla',
    body: `<div class="confirm"><p class="confirm-title">${esc(message)}</p>${detail ? `<p class="muted">${esc(detail)}</p>` : ''}<button class="btn block ${danger ? 'danger' : 'filled'}" data-ok>${esc(okLabel)}</button></div>`,
    onMount: ({ el, close }) => { el.querySelector('[data-ok]').onclick = () => { haptic(); close(true); }; }
  }).then((v) => !!v);
}

export function actionSheet(title, options) {
  return openSheet({
    title, cancel: 'Annulla',
    body: `<div class="list">${options.map((o, i) => `<button class="row action ${o.danger ? 'danger' : ''}" data-i="${i}">${o.icon ? `<span class="row-ic">${esc(o.icon)}</span>` : ''}<span class="row-main">${esc(o.label)}</span></button>`).join('')}</div>`,
    onMount: ({ el, close }) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { haptic(); close(options[b.dataset.i].value); } })
  });
}

export async function promptSheet(title, label, { type = 'text', value = '', placeholder = '' } = {}) {
  const r = await formSheet({ title, fields: [{ name: 'v', label, type, value, placeholder, required: true, autofocus: true }], submitLabel: 'OK' });
  return r ? r.v : null;
}

// ---------- Delegazione eventi ----------
export function bindActions(root, handlers) {
  const onClick = async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    if (el.closest('.swipe.open') && !el.closest('.swipe-actions')) { closeSwipes(); return; }
    pulse(el);
    try { await fn(el.dataset, el, e); } catch (err) { console.error(err); toast(err.message || 'Operazione non riuscita', { type: 'error' }); }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

// ---------- Righe con swipe (azioni nascoste a destra) ----------
export function closeSwipes(except) {
  $$('.swipe.open').forEach((s) => { if (s !== except) { s.classList.remove('open'); s.querySelector('.swipe-content').style.transform = ''; } });
}
export function enableSwipe(root) {
  let row = null, x0 = 0, y0 = 0, dx = 0, mode = null, width = 0;
  root.addEventListener('touchstart', (e) => {
    row = e.target.closest('.swipe');
    if (!row) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
    width = row.querySelector('.swipe-actions').offsetWidth;
    closeSwipes(row);
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!row) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) mode = Math.abs(mx) > Math.abs(my) + 4 ? 'h' : Math.abs(my) > 6 ? 'v' : null;
    if (mode !== 'h') return;
    const base = row.classList.contains('open') ? -width : 0;
    dx = Math.min(0, Math.max(-width - 30, base + mx));
    const c = row.querySelector('.swipe-content');
    c.style.transition = 'none';
    c.style.transform = `translateX(${dx}px)`;
  }, { passive: true });
  root.addEventListener('touchend', () => {
    if (!row || mode !== 'h') { row = null; return; }
    const c = row.querySelector('.swipe-content');
    c.style.transition = '';
    const open = dx < -width / 2;
    row.classList.toggle('open', open);
    c.style.transform = open ? `translateX(${-width}px)` : '';
    if (open) haptic();
    row = null;
  });
}
export const swipeRow = (content, actions) => raw(`<div class="swipe"><div class="swipe-actions">${actions}</div><div class="swipe-content">${content}</div></div>`);

// ---------- Piccoli componenti ----------
export const progress = (p, level = '') => raw(`<div class="progress ${level}" role="progressbar" aria-valuenow="${Math.round(Math.min(1, p) * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%"></span></div>`);
export const empty = (emoji, text, action = '') => raw(`<div class="empty"><div class="empty-ic" aria-hidden="true">${esc(emoji)}</div><p>${esc(text)}</p>${action}</div>`);
export function segmented(options, value, act = 'seg') {
  return raw(`<div class="seg" role="tablist">${options.map((o) => `<button role="tab" aria-selected="${o.value === value}" class="${o.value === value ? 'on' : ''}" data-act="${act}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div>`);
}
export function pageHeader(title, { back = null, right = '' } = {}) {
  return raw(`<header class="top">
    <div class="top-row">${back ? `<a class="back" href="${esc(back.href)}">${icon('back')}<span>${esc(back.label)}</span></a>` : '<span></span>'}<div class="top-actions">${right}</div></div>
    <h1 class="large-title">${esc(title)}</h1></header>`);
}
export const iconBtn = (name, act, label, extra = '') => raw(`<button class="icon-btn" data-act="${act}" aria-label="${esc(label)}" ${extra}>${icon(name)}</button>`);

// ---------- File ----------
export function pickFile(accept = '*/*') {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
export async function compressImage(file, max = 1600, quality = 0.72) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', quality));
  } catch { return file; }
}
/** Condivisione (Share Sheet → File/iCloud Drive) con fallback al download */
export async function shareOrDownload(blob, filename, title = filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'aborted'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
