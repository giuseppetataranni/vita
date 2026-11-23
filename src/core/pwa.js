// Registrazione service worker, banner di aggiornamento, controllo nuove versioni
import { esc } from './ui.js';

let waiting = null;
export async function registerSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const track = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => track(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'NAVIGATE') { const u = new URL(e.data.url); if (u.hash) location.hash = u.hash; } });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  } catch (e) { console.warn('Service worker non registrato', e); }
}
function showUpdate(w) {
  waiting = w;
  if (document.querySelector('.update-banner')) return;
  const b = document.createElement('div');
  b.className = 'update-banner';
  b.setAttribute('role', 'alert');
  b.innerHTML = `<span>${esc('Nuova versione disponibile')}</span><button class="btn small filled">Aggiorna</button>`;
  b.querySelector('button').onclick = () => { waiting.postMessage('SKIP_WAITING'); b.remove(); };
  document.body.append(b);
}
export async function checkForUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;
  await reg.update();
  return !!(reg.waiting || reg.installing);
}
