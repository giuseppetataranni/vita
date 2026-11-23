// Impostazioni: archiviazione, aspetto, sicurezza, notifiche, calendari, backup cifrati, dati
import { db, settings, setSetting } from '../core/db.js';
import { html, raw, esc, icon, bindActions, formSheet, confirmSheet, toast, pageHeader, segmented, pickFile, promptSheet, openSheet, haptic } from '../core/ui.js';
import { applyTheme, ACCENTS } from '../core/theme.js';
import { isStandalone, isIOS, storageInfo, requestPersist, bytes } from '../core/storage.js';
import { hasPin, setPin, clearPin, enrollFaceId, webauthnAvailable, verifyPin } from '../core/lock.js';
import { permission, requestPermission, testNotification, enablePush, disablePush, testPush, syncPush, notifSupported } from '../core/notify.js';
import { downloadBackup, importBackupText, exportTransactionsCsv, createSnapshot, restoreSnapshot, wipeAll } from '../core/backup.js';
import { loadSample, clearSample, hasSample } from '../core/sample.js';
import { checkForUpdate } from '../core/pwa.js';
import { passwordStrength, argonAvailable } from '../lib/crypto.js';
import { relDay } from '../core/format.js';

const NOTIF_KEYS = [['events', '📅 Eventi del calendario'], ['routines', '✅ Routine'], ['habits', '🔁 Abitudini'], ['finance', '💳 Scadenze e pagamenti'], ['goals', '🎯 Obiettivi'], ['mood', '🙂 Check-in umore serale'], ['meditation', '🧘 Meditazione'], ['review', '🗓️ Revisione domenicale'], ['backup', '💾 Promemoria backup']];
const sw = (key, on, label, sub = '') => html`<div class="field"><label for="s_${key}">${label}${sub ? html`<br><small class="muted">${sub}</small>` : ''}</label><input type="checkbox" switch class="switch" id="s_${key}" data-set="${key}" ${on ? 'checked' : ''}></div>`;
const timeRow = (key, label) => html`<div class="field"><label for="s_${key}">${label}</label><input type="time" id="s_${key}" data-set="${key}" value="${settings[key] || ''}"></div>`;
const textRow = (key, label, ph, type = 'text') => html`<div class="field"><label for="s_${key}">${label}</label><input type="${type}" id="s_${key}" data-set="${key}" value="${settings[key] || ''}" placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
const btnRow = (act, label, sub = '', danger = false) => html`<button class="row ${danger ? 'danger' : ''}" data-act="${act}"><span class="row-main"><strong style="${danger ? 'color:var(--red)' : 'color:var(--accent)'}">${label}</strong>${sub ? html`<small>${sub}</small>` : ''}</span></button>`;

/** Chiede una password nuova con conferma e misuratore di robustezza */
export async function askNewPassword(title = 'Password del backup') {
  const res = await formSheet({
    title, submitLabel: 'Cifra',
    extraTop: `<p class="caption" style="margin:0 4px 12px">Usa una frase di almeno 4 parole o 12+ caratteri. <b>Non è recuperabile</b>: senza password il backup non si apre. Salvala nel portachiavi di iCloud o scrivila su carta.</p><div class="card" style="margin-bottom:14px"><div class="kv"><span>Robustezza</span><b data-pw-label>–</b></div><div class="progress"><span data-pw-bar style="width:0"></span></div></div>`,
    fields: [
      { name: 'pw', label: 'Password', type: 'password', required: true, autofocus: true },
      { name: 'pw2', label: 'Ripeti', type: 'password', required: true }
    ],
    validate: (v) => v.pw !== v.pw2 ? 'Le due password non coincidono' : passwordStrength(v.pw).score < 3 ? 'Password troppo debole: allungala o usa più parole' : null,
    onMount: ({ form }) => {
      const bar = form.querySelector('[data-pw-bar]'), lab = form.querySelector('[data-pw-label]');
      for (const n of ['pw', 'pw2']) { form.elements[n].setAttribute('autocomplete', 'new-password'); }
      form.elements.pw.addEventListener('input', () => {
        const s = passwordStrength(form.elements.pw.value);
        bar.style.width = `${(s.score + 1) * 20}%`;
        bar.style.background = ['var(--red)', 'var(--red)', 'var(--orange)', 'var(--green)', 'var(--green)'][s.score];
        lab.textContent = `${s.label} (~${s.bits} bit)`;
      });
    }
  });
  return res ? res.pw : null;
}

export async function render(root, route, ctx) {
  const [info, faceOk, snaps, sample, argon] = await Promise.all([storageInfo(), webauthnAvailable(), db.snapshots.orderBy('createdAt').reverse().toArray(), hasSample(), argonAvailable()]);
  const perm = permission();
  const permLabel = { granted: 'Consentite', denied: 'Negate (riattivale in Impostazioni iOS → Notifiche → Vita)', default: 'Non ancora richieste', unsupported: 'Non disponibili: apri Vita dall’icona sulla Home' }[perm];
  root.innerHTML = String(html`${pageHeader('Impostazioni', { back: { href: '#/altro', label: 'Altro' } })}<main class="page">

  <div class="group-label">Installazione e archiviazione</div>
  <div class="list">
    <div class="row"><span class="row-main"><strong>App installata sulla Home</strong><small>${isStandalone() ? 'Sì: i dati sono al sicuro dalla pulizia automatica di Safari' : 'No: Safari → Condividi → Aggiungi alla schermata Home'}</small></span><span class="row-end">${isStandalone() ? '✅' : '⚠️'}</span></div>
    <div class="row"><span class="row-main"><strong>Archiviazione persistente</strong><small>${info.persisted ? 'Concessa' : 'Non confermata dal sistema'}</small></span>${info.persisted ? html`<span class="row-end">✅</span>` : html`<button class="btn small" data-act="persist">Richiedi</button>`}</div>
    <div class="row"><span class="row-main"><strong>Spazio usato</strong><small>${bytes(info.usage || 0)}${info.quota ? ` di ${bytes(info.quota)} disponibili` : ''}</small></span></div>
  </div>

  <div class="group-label">Aspetto</div>
  <div class="card">
    ${segmented([{ value: 'auto', label: 'Automatico' }, { value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }], settings.theme, 'theme')}
    <div class="chips" style="margin-top:14px" role="radiogroup" aria-label="Colore principale">${ACCENTS.map((c) => html`<button class="chip" data-act="accent" data-c="${c}" role="radio" aria-checked="${settings.accent === c}" aria-label="Colore ${c}" style="background:${c};width:40px;height:40px;padding:0;outline:${settings.accent === c ? '3px solid var(--text)' : 'none'};outline-offset:2px"></button>`)}
      <label class="chip" style="display:flex;align-items:center;gap:6px">Altro <input type="color" data-set="accent" value="${settings.accent}" style="width:28px;height:24px;border:0;background:none;padding:0"></label></div>
    <div style="margin-top:14px">${segmented([{ value: '1', label: 'Testo normale' }, { value: '1.12', label: 'Grande' }, { value: '1.25', label: 'Molto grande' }], String(settings.textScale || 1), 'textScale')}</div>
    <p class="caption" style="margin:8px 0 0">Vita segue anche la dimensione del testo di iOS (Impostazioni → Schermo e luminosità → Dimensioni testo).</p>
  </div>

  <div class="group-label">Sicurezza</div>
  <div class="list">
    ${hasPin() ? html`${btnRow('changePin', 'Cambia codice')}${btnRow('removePin', 'Disattiva codice', '', true)}` : btnRow('setPin', 'Imposta codice di blocco', '4–6 cifre, protetto con Argon2id')}
    ${hasPin() && faceOk ? sw('faceId', !!settings.faceIdCred, 'Sblocco con Face ID / Touch ID') : ''}
    <div class="field"><label for="s_autoLockMin">Blocco automatico</label><select id="s_autoLockMin" data-set="autoLockMin" data-num>${[[0, 'Subito'], [1, 'Dopo 1 minuto'], [3, 'Dopo 3 minuti'], [5, 'Dopo 5 minuti'], [15, 'Dopo 15 minuti'], [-1, 'Mai']].map(([v, l]) => html`<option value="${v}" ${Number(settings.autoLockMin) === v ? 'selected' : ''}>${l}</option>`)}</select></div>
  </div>
  <p class="caption">Backup cifrati con ${argon ? 'Argon2id (64 MiB) + AES-256-GCM' : 'PBKDF2-SHA256 (1.000.000 iterazioni) + AES-256-GCM'}. Sul telefono i dati sono protetti dalla cifratura di iOS quando l’iPhone è bloccato.</p>

  <div class="group-label">Notifiche</div>
  <div class="list">
    <div class="row"><span class="row-main"><strong>Permesso</strong><small>${permLabel}</small></span>${perm !== 'granted' && notifSupported() ? html`<button class="btn small filled" data-act="askNotif">Attiva</button>` : ''}</div>
    ${sw('notifOn', settings.notif.enabled, 'Promemoria attivi')}
    ${NOTIF_KEYS.map(([k, l]) => html`<div class="field"><label for="n_${k}">${l}</label><input type="checkbox" switch class="switch" id="n_${k}" data-notif="${k}" ${settings.notif[k] ? 'checked' : ''}></div>`)}
    ${timeRow('quietStart', 'Silenzioso dalle')}${timeRow('quietEnd', 'Silenzioso fino alle')}${timeRow('moodTime', 'Check-in umore alle')}${timeRow('meditationTime', 'Meditazione alle')}
    ${btnRow('testNotif', 'Invia notifica di prova')}
  </div>
  <p class="caption">Senza server le notifiche arrivano solo con l’app aperta; quelle perse vengono mostrate alla riapertura. Per riceverle ad app chiusa configura il server gratuito qui sotto (guida, capitolo 7).</p>

  <div class="group-label">Notifiche in background (Cloudflare, gratuito)</div>
  <div class="list">
    ${textRow('pushUrl', 'Indirizzo server', 'https://vita-push….workers.dev', 'url')}
    ${textRow('pushToken', 'Token', 'APP_TOKEN', 'password')}
    ${settings.pushActive ? html`${btnRow('testPush', 'Invia prova dal server')}${btnRow('syncPush', 'Sincronizza promemoria ora', settings.lastPushSync ? `Ultima: ${new Date(settings.lastPushSync).toLocaleString('it-IT')}` : '')}${btnRow('disablePush', 'Disattiva notifiche in background', '', true)}` : btnRow('enablePush', 'Attiva notifiche in background', 'Richiede indirizzo e token del tuo Worker')}
  </div>

  <p class="caption">I promemoria vengono cifrati sul telefono (AES-256-GCM) prima dell’invio: il server conosce solo l’orario, non il contenuto. La chiave non lascia mai l’iPhone.</p>

  <div class="group-label">Calendari</div>
  <div class="list">
    ${textRow('icsProxy', 'Ponte calendari', 'stesso indirizzo del server', 'url')}
    ${textRow('icsToken', 'Token ponte', 'stesso token', 'password')}
    ${btnRow('sameAsPush', 'Usa indirizzo e token del server notifiche')}
    ${sw('showHolidays', settings.showHolidays, 'Festività italiane')}
    ${sw('showDeadlines', settings.showDeadlines, 'Scadenze di finanze e obiettivi')}
  </div>

  <div class="group-label" id="backup">Backup e ripristino</div>
  <div class="list">
    <div class="row"><span class="row-main"><strong>Ultimo backup</strong><small>${settings.lastBackup ? `${relDay(settings.lastBackup.slice(0, 10))}, ${new Date(settings.lastBackup).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'Mai'}</small></span></div>
    ${btnRow('backupEnc', '🔐 Crea backup cifrato (consigliato)', 'Salvalo in File → iCloud Drive')}
    ${btnRow('backupPlain', 'Crea backup non cifrato', 'Leggibile da chiunque abbia il file')}
    ${btnRow('restore', 'Ripristina da un backup', 'Sostituisce i dati attuali (prima viene fatta una copia di sicurezza)')}
    ${btnRow('csv', 'Esporta movimenti in CSV', 'Non cifrato: per Excel/Numbers')}
    <div class="field"><label for="s_backupEveryDays">Ricordami il backup</label><select id="s_backupEveryDays" data-set="backupEveryDays" data-num>${[[3, 'Ogni 3 giorni'], [7, 'Ogni settimana'], [14, 'Ogni 2 settimane'], [30, 'Ogni mese'], [0, 'Mai']].map(([v, l]) => html`<option value="${v}" ${Number(settings.backupEveryDays) === v ? 'selected' : ''}>${l}</option>`)}</select></div>
  </div>
  <div class="group-label">Copie automatiche interne (ultime ${settings.snapshotsKeep || 10})</div>
  <div class="list">${snaps.length ? snaps.map((s) => html`<button class="row" data-act="snap" data-id="${s.id}"><span class="row-main"><strong>${new Date(s.createdAt).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong><small>${s.reason} · ${bytes(s.size)}</small></span><span class="row-end">Ripristina</span></button>`) : html`<div class="row"><span class="row-main"><small>Nessuna copia ancora: viene creata una volta al giorno.</small></span></div>`}
    ${btnRow('snapNow', 'Crea una copia adesso')}</div>
  <p class="caption">Le copie interne proteggono da errori (es. importazione sbagliata). Non proteggono se iOS cancella i dati dell’app: per questo serve il backup su iCloud Drive.</p>

  <div class="group-label">Finanze</div>
  <div class="list"><div class="field"><label for="s_emergencyTarget">Fondo emergenza obiettivo (mesi)</label><input type="number" id="s_emergencyTarget" data-set="emergencyTarget" data-num min="1" max="24" value="${settings.emergencyTarget}"></div></div>

  <div class="group-label">Dati di esempio</div>
  <div class="list">${sample ? btnRow('clearSample', 'Rimuovi i dati di esempio', 'I tuoi dati restano', true) : btnRow('loadSample', 'Carica dati di esempio', 'Per provare tutte le funzioni; si rimuovono con un tocco')}</div>

  <div class="group-label">App</div>
  <div class="list">
    <div class="row"><span class="row-main"><strong>Versione</strong><small>Vita ${__APP_VERSION__}</small></span></div>
    ${btnRow('update', 'Controlla aggiornamenti')}
    ${btnRow('reload', 'Riavvia l’app')}
    ${btnRow('wipe', 'Cancella tutti i dati', 'Irreversibile (resta una copia interna)', true)}
  </div>
  <p class="caption" style="text-align:center;margin:24px 0">Nessun server, nessun tracciamento, nessuna pubblicità.<br>I dati restano su questo iPhone.</p>
  </main>`);

  const refresh = () => ctx.rerender();
  if (route.sub === 'backup') setTimeout(() => root.querySelector('#backup')?.scrollIntoView({ block: 'start' }), 100);

  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.notif) { await setSetting('notif', { ...settings.notif, [t.dataset.notif]: t.checked }); haptic(); return; }
    const key = t.dataset.set;
    if (!key) return;
    if (key === 'notifOn') { await setSetting('notif', { ...settings.notif, enabled: t.checked }); if (t.checked && permission() === 'default') requestPermission().catch(() => {}); return; }
    if (key === 'faceId') {
      if (t.checked) { try { await enrollFaceId(); toast('Face ID attivato'); } catch (err) { t.checked = false; toast(`Face ID non attivato: ${err.message}`, { type: 'error' }); } }
      else await setSetting('faceIdCred', null);
      return;
    }
    let v = t.type === 'checkbox' ? t.checked : t.value.trim();
    if (t.dataset.num !== undefined) v = Number(v);
    await setSetting(key, v);
    if (key === 'accent') applyTheme();
    if (['showHolidays', 'showDeadlines'].includes(key)) haptic();
  });

  return bindActions(root, {
    persist: async () => { toast((await requestPersist()) ? 'Archiviazione persistente concessa' : 'iOS non l’ha confermata: con l’app installata sulla Home i dati restano comunque'); refresh(); },
    theme: async ({ value }) => { await setSetting('theme', value); applyTheme(); refresh(); },
    accent: async ({ c }) => { await setSetting('accent', c); applyTheme(); refresh(); },
    textScale: async ({ value }) => { await setSetting('textScale', Number(value)); applyTheme(); refresh(); },
    setPin: async () => { if (await pinFlow()) refresh(); },
    changePin: async () => {
      const old = await promptSheet('Codice attuale', 'Codice', { type: 'password' });
      if (old == null) return;
      if (!(await verifyPin(old))) return toast('Codice errato', { type: 'error' });
      if (await pinFlow()) refresh();
    },
    removePin: async () => {
      const old = await promptSheet('Codice attuale', 'Codice', { type: 'password' });
      if (old == null) return;
      if (!(await verifyPin(old))) return toast('Codice errato', { type: 'error' });
      await clearPin(); toast('Codice disattivato'); refresh();
    },
    askNotif: async () => { const p = await requestPermission().catch((e) => { toast(e.message, { type: 'error' }); return null; }); if (p === 'granted') toast('Notifiche attivate'); refresh(); },
    testNotif: () => testNotification(),
    enablePush: async () => { await enablePush(); toast('Notifiche in background attive'); refresh(); },
    disablePush: async () => { await disablePush(); toast('Disattivate'); refresh(); },
    testPush: async () => { await testPush(); toast('Richiesta inviata: la notifica arriva entro pochi secondi'); },
    syncPush: async () => { await syncPush(true); toast('Promemoria sincronizzati'); refresh(); },
    sameAsPush: async () => { if (!settings.pushUrl) return toast('Imposta prima l’indirizzo del server', { type: 'error' }); await setSetting('icsProxy', settings.pushUrl); await setSetting('icsToken', settings.pushToken); toast('Fatto'); refresh(); },
    backupEnc: async () => { const pw = await askNewPassword(); if (!pw) return; toast('Cifratura in corso…', { ms: 1500 }); await downloadBackup({ password: pw }); refresh(); },
    backupPlain: async () => { if (await confirmSheet('Backup non cifrato?', { okLabel: 'Crea comunque', detail: 'Chiunque abbia il file potrà leggere tutte le tue finanze, il diario e le note.' })) { await downloadBackup(); refresh(); } },
    restore: async () => {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      if (!(await confirmSheet('Ripristinare questo backup?', { okLabel: 'Ripristina', danger: true, detail: 'I dati attuali verranno sostituiti. Prima viene salvata una copia interna.' }))) return;
      const ok = await importBackupText(await f.text(), () => promptSheet('Backup cifrato', 'Password', { type: 'password' }));
      if (ok) { toast('Backup ripristinato'); setTimeout(() => location.reload(), 800); }
    },
    csv: () => exportTransactionsCsv(),
    snap: async ({ id }) => {
      if (!(await confirmSheet('Ripristinare questa copia?', { okLabel: 'Ripristina', danger: true, detail: 'I dati attuali verranno sostituiti (prima ne viene salvata una copia).' }))) return;
      await restoreSnapshot(Number(id)); toast('Copia ripristinata'); setTimeout(() => location.reload(), 800);
    },
    snapNow: async () => { await createSnapshot('manuale'); toast('Copia creata'); refresh(); },
    loadSample: async () => { toast('Caricamento…', { ms: 1200 }); await loadSample(); toast('Dati di esempio caricati'); refresh(); },
    clearSample: async () => { await clearSample(); toast('Dati di esempio rimossi'); refresh(); },
    update: async () => { toast((await checkForUpdate()) ? 'Aggiornamento trovato: tocca “Aggiorna” nel banner' : 'Hai già l’ultima versione'); },
    reload: () => location.reload(),
    wipe: async () => {
      const r = await formSheet({ title: 'Cancella tutto', submitLabel: 'Cancella', extraTop: '<p class="caption" style="margin:0 4px 12px">Scrivi CANCELLA per confermare. Fai prima un backup.</p>', fields: [{ name: 'w', label: 'Conferma', required: true, autofocus: true }] });
      if (!r || r.w !== 'CANCELLA') return r && toast('Testo non corretto: niente è stato cancellato');
      await wipeAll(); await db.meta.delete('seeded'); toast('Dati cancellati'); setTimeout(() => location.reload(), 800);
    }
  });
}

async function pinFlow() {
  const r = await formSheet({
    title: 'Codice di blocco', submitLabel: 'Salva',
    fields: [{ name: 'a', label: 'Nuovo codice (4–6 cifre)', type: 'password', required: true, autofocus: true }, { name: 'b', label: 'Ripeti', type: 'password', required: true }],
    validate: (v) => (!/^\d{4,6}$/.test(v.a) ? 'Usa da 4 a 6 cifre' : v.a !== v.b ? 'I codici non coincidono' : /^(\d)\1+$/.test(v.a) || '0123456789'.includes(v.a) ? 'Codice troppo prevedibile' : null),
    onMount: ({ form }) => ['a', 'b'].forEach((n) => { form.elements[n].setAttribute('inputmode', 'numeric'); form.elements[n].setAttribute('autocomplete', 'new-password'); })
  });
  if (!r) return false;
  await setPin(r.a);
  toast('Codice impostato');
  return true;
}
