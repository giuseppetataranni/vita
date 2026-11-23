// Promemoria: notifiche locali con app aperta, recupero dei "persi", push in background via Cloudflare Worker
import { db, settings, setSetting, onDataChange } from './db.js';
import { getOccurrences } from './agenda.js';
import { ymd, parseYmd, addDays, weekdayIdx, hm, fmtTime, money, pad } from './format.js';
import { toast, openSheet, esc } from './ui.js';
import { backupDue } from './backup.js';
import { newPushKey, sealReminder, opaqueId } from '../lib/pushcrypto.js';

export const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permission = () => (notifSupported() ? Notification.permission : 'unsupported');

/** Da chiamare SOLO dentro un tap dell'utente (requisito iOS) */
export async function requestPermission() {
  if (!notifSupported()) throw new Error('Notifiche non disponibili: installa l’app sulla schermata Home (iOS 16.4+)');
  const p = await Notification.requestPermission();
  if (p === 'granted') { await setSetting('notif', { ...settings.notif, enabled: true }); }
  return p;
}

export async function showNotification(title, body, { tag, url = './' } = {}) {
  if (permission() === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(title, { body, tag, icon: './icons/icon-192.png', data: { url } }); return true; }
    new Notification(title, { body, tag }); return true;
  }
  return false;
}

const at = (dateStr, time) => { const [h, m] = (time || '09:00').split(':').map(Number); const d = parseYmd(dateStr); d.setHours(h || 0, m || 0, 0, 0); return d; };

export function inQuiet(d) {
  const { quietStart: qs, quietEnd: qe } = settings;
  if (!qs || !qe || qs === qe) return false;
  const t = hm(d);
  return qs < qe ? t >= qs && t < qe : t >= qs || t < qe;
}
function afterQuiet(d) {
  if (!inQuiet(d)) return d;
  const [h, m] = settings.quietEnd.split(':').map(Number);
  const x = new Date(d); x.setHours(h, m, 0, 0);
  if (x <= d) x.setDate(x.getDate() + 1);
  return x;
}

/** Tutti i promemoria con orario tra from e to */
export async function collectReminders(from, to) {
  const n = settings.notif, out = [];
  const push = (r) => { if (r.at >= from && r.at <= to) out.push(r); };
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const days = [];
  for (let d = fromDay; d <= to; d = addDays(d, 1)) days.push(d);

  if (n.events) {
    const occ = await getOccurrences(from, addDays(to, 8));
    for (const o of occ) {
      if (o.virtual || o.ev?.alarm == null || o.ev.alarm === '') continue;
      const a = new Date(o.start.getTime() - Number(o.ev.alarm) * 60000);
      push({ id: `ev-${o.key}`, at: a, module: 'events', title: o.title, body: o.allDay ? 'Tutto il giorno' : `${fmtTime(o.start)}${o.ev.location ? ' · ' + o.ev.location : ''}`, url: '#/calendario' });
    }
  }
  if (n.routines || n.habits) {
    const [routines, habits] = await Promise.all([db.routines.toArray(), db.habits.toArray()]);
    for (const d of days) {
      const wd = weekdayIdx(d), ds = ymd(d);
      if (n.routines) for (const r of routines.filter((x) => x.active !== false && x.remind && (x.days || []).includes(wd))) {
        const first = (r.items || []).filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time))[0];
        const time = r.time || first?.time;
        if (time) push({ id: `ro-${r.id}-${ds}`, at: at(ds, time), module: 'routines', title: `${r.emoji || '✅'} ${r.name}`, body: `${(r.items || []).length} attività da completare`, url: '#/routine' });
      }
      if (n.habits) for (const h of habits.filter((x) => x.active !== false && x.remindTime && (x.days || [0, 1, 2, 3, 4, 5, 6]).includes(wd))) {
        push({ id: `ha-${h.id}-${ds}`, at: at(ds, h.remindTime), module: 'habits', title: `${h.emoji || '🔁'} ${h.name}`, body: 'Abitudine di oggi', url: '#/routine/abitudini' });
      }
    }
  }
  if (n.finance) {
    const [rec, debts] = await Promise.all([db.recurring.toArray(), db.debts.toArray()]);
    for (const r of rec.filter((x) => x.active !== false && x.nextDate)) {
      const before = Number(r.remindDaysBefore ?? 1);
      push({ id: `rc-${r.id}-${r.nextDate}`, at: at(ymd(addDays(parseYmd(r.nextDate), -before)), '09:00'), module: 'finance', title: `💳 ${r.title}`, body: `${money(r.amount)} ${before ? `tra ${before} giorn${before === 1 ? 'o' : 'i'}` : 'oggi'}`, url: '#/finanze/pianifica' });
    }
    for (const x of debts.filter((d) => !d.settled && d.dueDate)) push({ id: `db-${x.id}-${x.dueDate}`, at: at(x.dueDate, '09:00'), module: 'finance', title: `🤝 ${x.direction === 'owed' ? 'Incassa da' : 'Restituisci a'} ${x.person}`, body: money(x.amount), url: '#/finanze/pianifica' });
  }
  if (n.goals) {
    const goals = await db.goals.toArray();
    for (const g of goals.filter((x) => x.status !== 'done')) {
      if (g.deadline) push({ id: `go-${g.id}-${g.deadline}`, at: at(ymd(addDays(parseYmd(g.deadline), -1)), '09:00'), module: 'goals', title: `🎯 Domani scade: ${g.title}`, body: `Avanzamento ${Math.round((g.progress || 0) * 100)}%`, url: '#/routine/obiettivi' });
    }
  }
  for (const d of days) {
    const ds = ymd(d);
    if (n.mood && settings.moodTime) push({ id: `mo-${ds}`, at: at(ds, settings.moodTime), module: 'mood', title: '🙂 Come è andata oggi?', body: 'Registra umore e gratitudine', url: '#/mente/umore' });
    if (n.meditation && settings.meditationTime) push({ id: `me-${ds}`, at: at(ds, settings.meditationTime), module: 'meditation', title: '🧘 Meditazione del giorno', body: 'Bastano pochi minuti', url: '#/mente' });
    if (n.review && weekdayIdx(d) === 6) push({ id: `rv-${ds}`, at: at(ds, '18:00'), module: 'review', title: '🗓️ Revisione settimanale', body: 'Guarda com’è andata la settimana', url: '#/revisione' });
  }
  if (n.backup && settings.backupEveryDays) {
    const last = settings.lastBackup ? new Date(settings.lastBackup) : new Date(0);
    const due = new Date(Math.max(last.getTime() + settings.backupEveryDays * 86400000, from.getTime()));
    push({ id: `bk-${ymd(due)}`, at: at(ymd(due), '10:00'), module: 'backup', title: '💾 È ora di fare un backup', body: 'Salvalo su File/iCloud Drive', url: '#/impostazioni' });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ---------- Scheduler in primo piano + recupero dei promemoria persi ----------
let tick = null;
export async function startReminders() {
  const now = new Date();
  const last = settings.lastReminderCheck ? new Date(settings.lastReminderCheck) : now;
  const from = new Date(Math.max(last.getTime(), now.getTime() - 3 * 86400000));
  const missed = (await collectReminders(new Date(from.getTime() + 1), now)).filter((r) => !(r.module === 'mood' && r.at < addDays(now, -1)));
  await setSetting('lastReminderCheck', now.toISOString());
  if (missed.length && settings.notif.enabled) showMissed(missed);
  clearInterval(tick);
  tick = setInterval(checkDue, 20000);
}
async function checkDue() {
  const now = new Date();
  const last = new Date(settings.lastReminderCheck || now);
  if (now - last < 15000) return;
  await setSetting('lastReminderCheck', now.toISOString());
  if (!settings.notif.enabled) return;
  const due = await collectReminders(new Date(last.getTime() + 1), now);
  for (const r of due) {
    if (r.module === 'mood' && await db.moods.get(ymd(now))) continue;
    if (settings.pushActive || inQuiet(r.at) || document.visibilityState === 'visible') toast(`${r.title} — ${r.body}`, { ms: 5000 });
    else await showNotification(r.title, r.body, { tag: r.id, url: r.url });
  }
}
function showMissed(list) {
  openSheet({
    title: 'Promemoria mentre eri via',
    body: `<div class="list">${list.slice(-20).reverse().map((r) => `<a class="row" href="${esc(r.url)}" data-close-sheet><div class="row-main"><strong>${esc(r.title)}</strong><small>${esc(r.body)}</small></div><small class="muted">${esc(r.at.toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}</small></a>`).join('')}</div>`,
    onMount: ({ el, close }) => el.addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) close(); })
  });
}

export async function testNotification() {
  const ok = await showNotification('🔔 Notifica di prova', 'Le notifiche funzionano.', { tag: 'test' });
  if (!ok) toast('Permesso notifiche non concesso', { type: 'error' });
}

// ---------- Push in background (Cloudflare Worker gratuito) ----------
const urlB64ToUint8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); };
async function api(path, body) {
  const base = settings.pushUrl.replace(/\/$/, '');
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.pushToken}` }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Server promemoria: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Attiva la push (dopo un tap): iscrizione e invio promemoria dei prossimi 14 giorni */
export async function enablePush() {
  if (!settings.pushUrl || !settings.pushToken) throw new Error('Inserisci indirizzo e token del server promemoria');
  if (permission() !== 'granted' && (await requestPermission()) !== 'granted') throw new Error('Permesso notifiche negato');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/vapid');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) });
  await api('/subscribe', { deviceId: settings.deviceId, subscription: sub.toJSON() });
  await setSetting('pushActive', true);
  await syncPush(true);
}
export async function disablePush() {
  try { await api('/unsubscribe', { deviceId: settings.deviceId }); } catch { /* server non raggiungibile */ }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await setSetting('pushActive', false);
}
let lastSig = null;
export async function syncPush(force = false) {
  if (!settings.pushActive || !settings.notif.enabled || !navigator.onLine) return;
  const now = new Date();
  const list = (await collectReminders(now, addDays(now, 14))).slice(0, 400)
    .map((r) => ({ id: r.id, at: Math.floor(afterQuiet(r.at).getTime() / 60000) * 60000, title: r.title, body: r.body, url: r.url }));
  // Invia solo se qualcosa è cambiato (o ogni 12 ore): rispetta i limiti gratuiti di Cloudflare
  const sig = JSON.stringify(list);
  if (!force && sig === lastSig && settings.lastPushSync && now - new Date(settings.lastPushSync) < 12 * 3600000) return;
  // Cifratura end-to-end: al server arrivano solo orario, identificativo opaco e testo cifrato
  let key = settings.pushKey;
  if (!key) { key = newPushKey(); await setSetting('pushKey', key); }
  const reminders = await Promise.all(list.map(async (r) => ({ id: await opaqueId(key, r.id), at: r.at, enc: await sealReminder(key, { title: r.title, body: r.body, url: r.url }) })));
  await api('/reminders', { deviceId: settings.deviceId, reminders });
  lastSig = sig;
  await setSetting('lastPushSync', now.toISOString());
}
export async function testPush() { await api('/test', { deviceId: settings.deviceId }); }

let syncTimer = null;
export function initPushSync() {
  const run = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncPush().catch((e) => console.warn(e)), 2500); };
  onDataChange(run);
  window.addEventListener('settings', (e) => { if (['notif', 'quietStart', 'quietEnd', 'moodTime', 'meditationTime', 'backupEveryDays', 'lastBackup'].includes(e.detail.key)) run(); });
  window.addEventListener('online', run);
  run();
}
