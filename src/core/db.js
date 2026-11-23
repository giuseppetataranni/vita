// Database locale (IndexedDB via Dexie) con schema versionato e migrazioni
import Dexie from 'dexie';

export const db = new Dexie('vita');

// v1: schema iniziale
db.version(1).stores({
  accounts: '++id, name, archived',
  categories: '++id, kind, parentId',
  transactions: '++id, date, type, accountId, categoryId, recurringId, *tags',
  recurring: '++id, nextDate, active',
  budgets: '++id, &categoryId',
  savings: '++id, accountId',
  debts: '++id, direction, dueDate, settled',
  attachments: '++id, [ownerType+ownerId]',
  calendars: '++id, source',
  events: '++id, calendarId, start, uid',
  routines: '++id, active',
  routineLogs: '++id, &[routineId+itemId+date], date, routineId',
  schedule: 'weekday',
  goals: '++id, category, status',
  habits: '++id, goalId',
  habitLogs: '++id, &[habitId+date], date',
  quotes: '++id',
  meditations: '++id, date',
  gratitude: '++id, date',
  moods: 'date',
  notes: '++id, kind, pinned, updatedAt',
  learning: '++id, status',
  health: '++id, &[type+date], date, type',
  journal: '++id, date, *tags',
  settings: 'key',
  meta: 'key',
  snapshots: '++id, createdAt'
});

// v2 (esempio di migrazione): aggiunge "group" alle categorie esistenti e "visible" ai calendari
db.version(2).stores({}).upgrade(async (tx) => {
  await tx.table('categories').toCollection().modify((c) => { if (!('group' in c)) c.group = c.kind === 'income' ? null : 'want'; });
  await tx.table('calendars').toCollection().modify((c) => { if (!('visible' in c)) c.visible = true; });
});

export const SCHEMA_VERSION = 2;
export const DATA_TABLES = db.tables.map((t) => t.name).filter((n) => n !== 'snapshots');

// ---------- Notifica cambiamenti (per promemoria, push, widget) ----------
const listeners = new Set();
let pending = new Set(), timer = null;
export const onDataChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (table) => {
  pending.add(table);
  clearTimeout(timer);
  timer = setTimeout(() => { const t = pending; pending = new Set(); listeners.forEach((fn) => fn(t)); }, 400);
};
for (const t of db.tables) {
  if (['settings', 'meta', 'snapshots'].includes(t.name)) continue;
  t.hook('creating', () => emit(t.name));
  t.hook('updating', () => emit(t.name));
  t.hook('deleting', () => emit(t.name));
}

// ---------- Impostazioni ----------
export const DEFAULTS = {
  theme: 'auto', accent: '#0a84ff', textScale: 1,
  pinHash: null, pinSalt: null, faceIdCred: null, autoLockMin: 3,
  backupEveryDays: 7, lastBackup: null, snapshotsKeep: 10,
  notif: { enabled: false, events: true, routines: true, habits: true, finance: true, goals: true, mood: true, meditation: true, backup: true, review: true },
  quietStart: '22:30', quietEnd: '07:00', moodTime: '21:00', meditationTime: '07:30',
  ttsRate: 0.9, ttsOn: true, breathVoice: false,
  pushUrl: '', pushToken: '', pushGeneric: false, pushActive: false, deviceId: null,
  icsProxy: '', icsToken: '', showHolidays: true, showDeadlines: true,
  emergencyTarget: 6, waterTarget: 8, sleepTarget: 8,
  lastReminderCheck: null, onboarded: false
};
export const settings = { ...DEFAULTS };

export async function loadSettings() {
  const rows = await db.settings.toArray();
  for (const r of rows) settings[r.key] = r.value;
  settings.notif = { ...DEFAULTS.notif, ...(settings.notif || {}) };
  if (!settings.deviceId) await setSetting('deviceId', crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  return settings;
}
export async function setSetting(key, value) {
  settings[key] = value;
  await db.settings.put({ key, value });
  window.dispatchEvent(new CustomEvent('settings', { detail: { key, value } }));
}
export const getMeta = async (key, def = null) => (await db.meta.get(key))?.value ?? def;
export const setMeta = (key, value) => db.meta.put({ key, value });

// ---------- Dati iniziali ----------
export const DEFAULT_CATEGORIES = [
  ['expense', '🏠', 'Casa', '#ff9f0a', 'need', true, ['Affitto/Mutuo', 'Bollette', 'Manutenzione']],
  ['expense', '🛒', 'Spesa alimentare', '#30d158', 'need', false, ['Supermercato', 'Mercato']],
  ['expense', '🚗', 'Trasporti', '#0a84ff', 'need', false, ['Carburante', 'Mezzi pubblici', 'Auto']],
  ['expense', '💊', 'Salute', '#ff375f', 'need', false, ['Farmacia', 'Visite']],
  ['expense', '📱', 'Abbonamenti', '#5e5ce6', 'want', true, ['Streaming', 'Telefono', 'Software']],
  ['expense', '🍕', 'Ristoranti e bar', '#ff6482', 'want', false, ['Ristorante', 'Bar e caffè', 'Asporto']],
  ['expense', '🎉', 'Svago', '#bf5af2', 'want', false, ['Uscite', 'Viaggi', 'Hobby']],
  ['expense', '👕', 'Shopping', '#64d2ff', 'want', false, ['Abbigliamento', 'Casa e arredo', 'Elettronica']],
  ['expense', '📚', 'Formazione', '#ac8e68', 'need', false, []],
  ['expense', '🎁', 'Regali', '#ffd60a', 'want', false, []],
  ['expense', '🐷', 'Risparmio e investimenti', '#30d158', 'save', false, []],
  ['expense', '❔', 'Altro', '#8e8e93', 'want', false, []],
  ['income', '💼', 'Stipendio', '#30d158', null, true, []],
  ['income', '🧾', 'Extra e freelance', '#0a84ff', null, false, []],
  ['income', '🎁', 'Regali ricevuti', '#ffd60a', null, false, []],
  ['income', '📈', 'Interessi e rendite', '#5e5ce6', null, false, []],
  ['income', '↩️', 'Rimborsi', '#64d2ff', null, false, []]
];

export async function ensureSeed() {
  if (await getMeta('seeded')) return;
  await db.transaction('rw', db.categories, db.accounts, db.calendars, db.meta, async () => {
    for (const [kind, icon, name, color, group, fixed, subs] of DEFAULT_CATEGORIES) {
      const id = await db.categories.add({ kind, icon, name, color, group, fixed, parentId: null });
      for (const s of subs) await db.categories.add({ kind, icon, name: s, color, group, fixed, parentId: id });
    }
    await db.accounts.bulkAdd([
      { name: 'Contanti', type: 'contanti', icon: '💶', color: '#30d158', initial: 0, liquid: true, archived: false },
      { name: 'Carta/Conto', type: 'conto', icon: '💳', color: '#0a84ff', initial: 0, liquid: true, archived: false },
      { name: 'Risparmi', type: 'risparmio', icon: '🏦', color: '#5e5ce6', initial: 0, liquid: true, archived: false }
    ]);
    await db.calendars.bulkAdd([
      { name: 'Personale', color: '#0a84ff', source: 'local', visible: true },
      { name: 'Lavoro', color: '#ff9f0a', source: 'local', visible: true }
    ]);
    await db.meta.put({ key: 'seeded', value: true });
  });
}

/** Cache semplice per tabelle piccole e lette spesso */
export async function lookups() {
  const [accounts, categories, calendars] = await Promise.all([db.accounts.toArray(), db.categories.toArray(), db.calendars.toArray()]);
  return { accounts, categories, calendars, catMap: new Map(categories.map((c) => [c.id, c])), accMap: new Map(accounts.map((a) => [a.id, a])), calMap: new Map(calendars.map((c) => [c.id, c])) };
}
