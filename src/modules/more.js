// Menu "Altro"
import { html, icon, pageHeader } from '../core/ui.js';
import { settings } from '../core/db.js';
import { backupDue } from '../core/backup.js';
import { isStandalone } from '../core/storage.js';

const ITEMS = [
  ['#/mente', '🧘', 'Mente', 'Frase del giorno, meditazioni, umore e gratitudine', '#5e5ce6'],
  ['#/note', '🗒️', 'Note e liste', 'Note rapide, spesa, da leggere, da imparare', '#ff9f0a'],
  ['#/salute', '💧', 'Salute', 'Acqua, sonno, peso, allenamento', '#30d158'],
  ['#/diario', '📔', 'Diario', 'Voci giornaliere con tag e ricerca', '#bf5af2'],
  ['#/revisione', '📊', 'Revisione', 'Riepilogo settimanale e mensile automatico', '#0a84ff'],
  ['#/cerca', '🔎', 'Cerca', 'In tutta l’app', '#8e8e93'],
  ['#/impostazioni', '⚙️', 'Impostazioni', 'Aspetto, sicurezza, notifiche, backup, calendari', '#636366']
];

export async function render(root) {
  root.innerHTML = String(html`${pageHeader('Altro')}<main class="page">
  ${!isStandalone() ? html`<a class="banner warn" href="#/impostazioni"><span>📲</span><p>Per non perdere i dati, installa Vita: Safari → Condividi → Aggiungi alla schermata Home.</p></a>` : ''}
  ${backupDue() ? html`<a class="banner" href="#/impostazioni"><span>💾</span><p>${settings.lastBackup ? 'È passato un po’ dall’ultimo backup.' : 'Non hai ancora fatto un backup.'} Salvalo su iCloud Drive.</p></a>` : ''}
  <div class="list">${ITEMS.map(([href, emoji, title, sub, col]) => html`<a class="row has-ic" href="${href}"><span class="row-ic" style="background:${col}26">${emoji}</span><span class="row-main"><strong>${title}</strong><small>${sub}</small></span>${icon('chev', 'chev')}</a>`)}</div>
  <p class="caption" style="text-align:center;margin-top:24px">Vita ${__APP_VERSION__} · i tuoi dati restano su questo telefono</p></main>`);
}
