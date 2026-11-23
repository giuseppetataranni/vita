import './styles/app.css';
import { db, loadSettings, ensureSeed, settings } from './core/db.js';
import { applyTheme } from './core/theme.js';
import { buildTabbar, startRouter } from './core/router.js';
import { hasPin, showLock, initAutoLock } from './core/lock.js';
import { registerSW } from './core/pwa.js';
import { requestPersist } from './core/storage.js';
import { autoSnapshot } from './core/backup.js';
import { startReminders, initPushSync } from './core/notify.js';
import { processRecurring } from './core/money.js';
import { enableSwipe } from './core/ui.js';

async function boot() {
  try {
    await db.open();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="page"><div class="empty"><div class="empty-ic">⚠️</div><p>Archivio locale non disponibile (${e.name}). Apri l’app dall’icona sulla schermata Home e non in navigazione privata.</p></div></div>`;
    return;
  }
  await loadSettings();
  applyTheme();
  await ensureSeed();
  buildTabbar();
  enableSwipe(document.body);
  if (hasPin()) await showLock();
  initAutoLock();
  startRouter();
  registerSW();

  // Persistenza: alcuni browser la concedono solo dopo un gesto dell'utente
  requestPersist();
  window.addEventListener('pointerdown', () => requestPersist(), { once: true });

  setTimeout(async () => {
    try {
      await processRecurring();
      await autoSnapshot();
      await startReminders();
      initPushSync();
      const subs = await db.calendars.where('source').equals('url').count();
      if (subs && navigator.onLine) (await import('./modules/calendar.js')).syncSubscriptions(false).catch(() => {});
    } catch (e) { console.warn(e); }
  }, 600);
}

window.addEventListener('unhandledrejection', (e) => console.warn('Errore non gestito', e.reason));
boot();
