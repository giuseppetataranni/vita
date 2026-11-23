// Router con hash, caricamento pigro dei moduli e tab bar
import { icon, esc, haptic, closeSwipes } from './ui.js';

const ROUTES = {
  oggi: () => import('../modules/today.js'),
  finanze: () => import('../modules/finance.js'),
  calendario: () => import('../modules/calendar.js'),
  routine: () => import('../modules/routines.js'),
  altro: () => import('../modules/more.js'),
  mente: () => import('../modules/mind.js'),
  note: () => import('../modules/notes.js'),
  salute: () => import('../modules/health.js'),
  diario: () => import('../modules/journal.js'),
  revisione: () => import('../modules/review.js'),
  impostazioni: () => import('../modules/settings.js'),
  cerca: () => import('../modules/search.js')
};
const TABS = [
  ['oggi', 'Oggi', 'oggi'], ['finanze', 'Finanze', 'finanze'], ['calendario', 'Calendario', 'calendario'],
  ['routine', 'Routine', 'routine'], ['altro', 'Altro', 'altro']
];
const TAB_OF = { mente: 'altro', note: 'altro', salute: 'altro', diario: 'altro', revisione: 'altro', impostazioni: 'altro', cerca: 'altro' };

const app = () => document.getElementById('app');
const scrolls = new Map();
let current = null, cleanup = null, renderSeq = 0;

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'oggi';
  const [path, qs = ''] = h.split('?');
  const [name, ...rest] = path.split('/').filter(Boolean);
  return { name: ROUTES[name] ? name : 'oggi', sub: rest[0] || '', rest, query: new URLSearchParams(qs), hash: '#/' + h };
}

export function buildTabbar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map(([id, label, ic]) => `<a href="#/${id}" class="tab" data-tab="${id}" aria-label="${esc(label)}">${icon(ic)}<span>${esc(label)}</span></a>`).join('');
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('.tab');
    if (!a) return;
    haptic();
    if (location.hash.startsWith(a.getAttribute('href')) && location.hash === a.getAttribute('href')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
}

export async function render(force = false) {
  const route = parseHash();
  const seq = ++renderSeq;
  if (current) scrolls.set(current.hash, window.scrollY);
  const tab = TAB_OF[route.name] || route.name;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('on', on);
    on ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current');
  });
  closeSwipes();
  let mod;
  try { mod = await ROUTES[route.name](); }
  catch (e) {
    console.error(e);
    app().innerHTML = `<div class="page"><div class="empty"><div class="empty-ic">⚠️</div><p>Impossibile caricare la sezione. Controlla la connessione e riapri l’app.</p></div></div>`;
    return;
  }
  if (seq !== renderSeq) return;
  if (cleanup) { try { cleanup(); } catch { /* ignora */ } cleanup = null; }
  const root = document.createElement('div');
  root.className = 'view';
  root.dataset.view = route.name;
  const same = current && current.name === route.name;
  const ctx = { route, rerender: () => render(true) };
  try { cleanup = (await mod.render(root, route, ctx)) || null; }
  catch (e) {
    console.error(e);
    root.innerHTML = `<div class="page"><div class="empty"><div class="empty-ic">⚠️</div><p>${esc(e.message || 'Errore')}</p></div></div>`;
  }
  if (seq !== renderSeq) return;
  const swap = () => { app().replaceChildren(root); };
  if (!same && !force && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(swap);
  else swap();
  current = route;
  const y = (same || force) ? (scrolls.get(route.hash) ?? window.scrollY) : (scrolls.get(route.hash) || 0);
  requestAnimationFrame(() => window.scrollTo(0, y));
  const h1 = root.querySelector('h1');
  document.title = h1 ? `${h1.textContent} · Vita` : 'Vita';
}

export function startRouter() {
  window.addEventListener('hashchange', () => render());
  render();
}
export const go = (hash) => { if (location.hash === hash) render(true); else location.hash = hash; };
