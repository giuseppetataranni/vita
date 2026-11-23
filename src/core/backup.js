// Backup completo JSON (anche cifrato), snapshot automatici interni, CSV movimenti
import { db, DATA_TABLES, SCHEMA_VERSION, settings, setSetting, lookups, getMeta, setMeta } from './db.js';
import { encryptJson, decryptJson, b64, unb64 } from '../lib/crypto.js';
import { toCsv, parseCsv, parseDateIt } from '../lib/csv.js';
import { today, pad, parseAmount, round2 } from './format.js';
import { shareOrDownload, toast } from './ui.js';

const stamp = () => { const d = new Date(); return `${today()}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
const blobToB64 = async (blob) => b64(await blob.arrayBuffer());
const b64ToBlob = (s, type) => new Blob([unb64(s)], { type });

export async function exportData({ attachments = true } = {}) {
  const tables = {};
  for (const name of DATA_TABLES) {
    if (name === 'attachments') {
      const rows = attachments ? await db.attachments.toArray() : [];
      tables.attachments = await Promise.all(rows.map(async (r) => ({ ...r, blob: undefined, data: r.blob ? await blobToB64(r.blob) : null, mime: r.blob?.type || r.mime })));
    } else tables[name] = await db.table(name).toArray();
  }
  return { format: 'vita-backup', app: 'Vita', appVersion: __APP_VERSION__, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

export async function downloadBackup({ password = null } = {}) {
  let payload = await exportData();
  if (password) payload = await encryptJson(payload, password);
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const res = await shareOrDownload(blob, `vita-backup-${stamp()}${password ? '-cifrato' : ''}.json`, 'Backup Vita');
  if (res !== 'aborted') { await setSetting('lastBackup', new Date().toISOString()); toast('Backup pronto'); }
  return res;
}

export const isEncrypted = (obj) => obj && obj.format === 'vita-encrypted';

export async function restoreData(obj) {
  if (!obj || obj.format !== 'vita-backup' || !obj.tables) throw new Error('File non valido: non è un backup di Vita');
  if (obj.schema > SCHEMA_VERSION) throw new Error('Backup creato con una versione più recente: aggiorna prima l’app');
  await createSnapshot('prima del ripristino');
  const keep = { deviceId: settings.deviceId };
  await db.transaction('rw', DATA_TABLES.map((n) => db.table(n)), async () => {
    for (const name of DATA_TABLES) {
      await db.table(name).clear();
      let rows = obj.tables[name] || [];
      if (name === 'attachments') rows = rows.map((r) => ({ ...r, blob: r.data ? b64ToBlob(r.data, r.mime || 'image/jpeg') : null, data: undefined }));
      if (name === 'settings') rows = rows.filter((r) => !['deviceId', 'pushActive', 'pushKey', 'lastPushSync', 'pinFails', 'pinLockUntil', 'lastReminderCheck'].includes(r.key));
      if (rows.length) await db.table(name).bulkPut(rows);
    }
    await db.settings.put({ key: 'deviceId', value: keep.deviceId });
  });
}

export async function importBackupText(text, askPassword) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Il file non è un JSON valido'); }
  if (isEncrypted(obj)) {
    const pw = await askPassword();
    if (!pw) return false;
    try { obj = await decryptJson(obj, pw); } catch { throw new Error('Password errata o file danneggiato'); }
  }
  await restoreData(obj);
  return true;
}

// ---------- Snapshot interni (rete di sicurezza contro errori, non contro la cancellazione dello storage) ----------
export async function createSnapshot(reason = 'automatico') {
  const data = await exportData({ attachments: false });
  const json = JSON.stringify(data);
  await db.snapshots.add({ createdAt: new Date().toISOString(), reason, size: json.length, json });
  const all = await db.snapshots.orderBy('createdAt').toArray();
  const keep = settings.snapshotsKeep || 10;
  if (all.length > keep) await db.snapshots.bulkDelete(all.slice(0, all.length - keep).map((s) => s.id));
}
export async function autoSnapshot() {
  const last = await getMeta('lastSnapshotDay');
  if (last === today()) return;
  const count = await db.transactions.count() + await db.events.count() + await db.notes.count() + await db.journal.count();
  if (count === 0) return;
  await createSnapshot('giornaliero');
  await setMeta('lastSnapshotDay', today());
}
export async function restoreSnapshot(id) {
  const s = await db.snapshots.get(id);
  if (!s) throw new Error('Snapshot non trovato');
  const obj = JSON.parse(s.json);
  const att = await db.attachments.toArray();
  await restoreData(obj);
  if (att.length) await db.attachments.bulkPut(att); // gli allegati non sono negli snapshot: li conserviamo
}

export function backupDue() {
  if (!settings.backupEveryDays) return false;
  if (!settings.lastBackup) return true;
  return (Date.now() - new Date(settings.lastBackup).getTime()) / 86400000 >= settings.backupEveryDays;
}

// ---------- CSV ----------
export async function exportTransactionsCsv(filter = null) {
  const { accMap, catMap } = await lookups();
  let txs = await db.transactions.orderBy('date').toArray();
  if (filter) txs = txs.filter(filter);
  const typeLabel = { income: 'entrata', expense: 'uscita', transfer: 'trasferimento' };
  const rows = [['data', 'tipo', 'importo', 'conto', 'conto_destinazione', 'categoria', 'sottocategoria', 'descrizione', 'tag', 'note']];
  for (const t of txs) {
    const c = catMap.get(t.categoryId), parent = c && c.parentId ? catMap.get(c.parentId) : null;
    const signed = t.type === 'expense' ? -t.amount : t.amount;
    rows.push([t.date.split('-').reverse().join('/'), typeLabel[t.type], String(signed).replace('.', ','), accMap.get(t.accountId)?.name || '', accMap.get(t.toAccountId)?.name || '',
      parent ? parent.name : c?.name || '', parent ? c?.name : '', t.description || '', (t.tags || []).join(', '), t.note || '']);
  }
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  return shareOrDownload(blob, `vita-movimenti-${stamp()}.csv`, 'Movimenti');
}

/** Import CSV: colonne riconosciute per nome (data, importo, descrizione, categoria, conto, tipo, tag, note) */
export async function importTransactionsCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV vuoto');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ci = { date: col('data', 'date'), amount: col('importo', 'amount', 'valore'), desc: col('descrizione', 'description', 'causale'), cat: col('categoria', 'category'), sub: col('sottocategoria'), acc: col('conto', 'account'), type: col('tipo', 'type'), tags: col('tag'), note: col('note') };
  if (ci.date < 0 || ci.amount < 0) throw new Error('Servono almeno le colonne "data" e "importo"');
  const { accounts, categories } = await lookups();
  const accByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.id]));
  const catByName = new Map(categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
  const defaultAcc = accounts.find((a) => a.type === 'conto')?.id || accounts[0]?.id;
  let added = 0, skipped = 0;
  await db.transaction('rw', db.transactions, db.categories, db.accounts, async () => {
    for (const r of rows.slice(1)) {
      const date = parseDateIt(r[ci.date] || '');
      let amount = parseAmount(r[ci.amount]);
      if (!date || Number.isNaN(amount)) { skipped++; continue; }
      let type = (r[ci.type] || '').toLowerCase();
      type = type.startsWith('entr') || type === 'income' ? 'income' : type.startsWith('tras') || type === 'transfer' ? 'transfer' : type.startsWith('usc') || type === 'expense' ? 'expense' : amount < 0 ? 'expense' : 'income';
      amount = round2(Math.abs(amount));
      const accName = (r[ci.acc] || '').trim();
      let accountId = accByName.get(accName.toLowerCase());
      if (!accountId && accName) { accountId = await db.accounts.add({ name: accName, type: 'conto', icon: '💳', color: '#0a84ff', initial: 0, liquid: true, archived: false }); accByName.set(accName.toLowerCase(), accountId); }
      let categoryId = null;
      const catName = ((ci.sub >= 0 && r[ci.sub]) || (ci.cat >= 0 && r[ci.cat]) || '').trim();
      if (catName && type !== 'transfer') {
        const k = `${type}:${catName.toLowerCase()}`;
        categoryId = catByName.get(k);
        if (!categoryId) { categoryId = await db.categories.add({ kind: type, name: catName, icon: '🏷️', color: '#8e8e93', group: type === 'expense' ? 'want' : null, parentId: null }); catByName.set(k, categoryId); }
      }
      await db.transactions.add({ date, type, amount, accountId: accountId || defaultAcc, categoryId, description: ci.desc >= 0 ? r[ci.desc] : '', tags: ci.tags >= 0 ? (r[ci.tags] || '').split(',').map((s) => s.trim()).filter(Boolean) : [], note: ci.note >= 0 ? r[ci.note] : '', createdAt: Date.now() });
      added++;
    }
  });
  return { added, skipped };
}

export async function wipeAll() {
  await createSnapshot('prima della cancellazione');
  await db.transaction('rw', DATA_TABLES.map((n) => db.table(n)), async () => {
    for (const n of DATA_TABLES) if (n !== 'settings') await db.table(n).clear();
  });
}
