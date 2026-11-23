// Cifratura end-to-end dei promemoria inviati al server push:
// il server conserva solo l'orario e un blocco cifrato che non può leggere.
// La chiave (AES-256-GCM) nasce e resta sul telefono, nell'archivio dell'app.
import { b64, unb64, randBytes } from './crypto.js';

const te = new TextEncoder(), td = new TextDecoder();
export const newPushKey = () => b64(randBytes(32));

export async function sealReminder(keyB64, obj) {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = randBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function openReminder(keyB64, enc) {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['decrypt']);
  const data = unb64(enc);
  return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12))));
}

/** Identificativo opaco (HMAC-SHA256): il server non capisce se è un evento, una spesa o un'abitudine */
export async function opaqueId(keyB64, id) {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(String(id))));
  return b64(sig.slice(0, 16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
