// Crittografia di Vita
// - Backup: Argon2id (64 MiB, 3 passaggi) -> chiave AES-256-GCM, sale 32 byte, IV 96 bit casuali,
//   intestazione autenticata (AAD), compressione gzip prima della cifratura.
//   Ripiego automatico: PBKDF2-SHA256 con 1.000.000 di iterazioni se WebAssembly non è disponibile.
// - PIN: Argon2id (19 MiB, 2 passaggi) con confronto a tempo costante.
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (buf) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export const KDF_BACKUP = { name: 'argon2id', m: 65536, t: 3, p: 1 };
export const KDF_PIN = { name: 'argon2id', m: 19456, t: 2, p: 1 };
export const KDF_FALLBACK = { name: 'pbkdf2-sha256', iter: 1000000 };

let argonOk = null;
async function argon(password, salt, k) {
  const { argon2id } = await import('hash-wasm');
  return argon2id({ password, salt, parallelism: k.p, iterations: k.t, memorySize: k.m, hashLength: 32, outputType: 'binary' });
}
export async function argonAvailable() {
  if (argonOk !== null) return argonOk;
  try { await argon('test', randBytes(16), { m: 64, t: 1, p: 1 }); argonOk = true; } catch { argonOk = false; }
  return argonOk;
}

/** Deriva 32 byte dalla password secondo i parametri indicati */
export async function deriveBytes(password, salt, kdf) {
  const pw = String(password).normalize('NFKC');
  if (kdf.name === 'argon2id') return argon(pw, salt, kdf);
  if (kdf.name === 'pbkdf2-sha256') {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: kdf.iter, hash: 'SHA-256' }, base, 256));
  }
  throw new Error('Algoritmo di derivazione sconosciuto');
}
async function aesKey(bytes) {
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  bytes.fill(0); // cancella la chiave grezza dalla memoria
  return key;
}

async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function gunzip(bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

// L'intestazione (senza i dati) è autenticata: nessun parametro può essere alterato senza far fallire la verifica
const headerAad = (h) => enc.encode(JSON.stringify({ format: h.format, v: h.v, cipher: h.cipher, kdf: h.kdf, salt: h.salt, iv: h.iv, compressed: h.compressed, createdAt: h.createdAt }));

export async function encryptJson(obj, password, { kdf = null } = {}) {
  const useKdf = kdf || ((await argonAvailable()) ? KDF_BACKUP : KDF_FALLBACK);
  const salt = randBytes(32), iv = randBytes(12);
  const plain = enc.encode(JSON.stringify(obj));
  const zipped = await gzip(plain);
  const header = { format: 'vita-encrypted', v: 2, cipher: 'AES-256-GCM', kdf: useKdf, salt: b64(salt), iv: b64(iv), compressed: !!zipped, createdAt: new Date().toISOString() };
  const key = await aesKey(await deriveBytes(password, salt, useKdf));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: headerAad(header), tagLength: 128 }, key, zipped || plain);
  plain.fill(0);
  return { ...header, data: b64(data) };
}

export async function decryptJson(payload, password) {
  if (payload.v === 1) { // formato precedente: PBKDF2 310.000, senza AAD
    const key = await aesKey(await deriveBytes(password, unb64(payload.salt), { name: 'pbkdf2-sha256', iter: payload.iter || 310000 }));
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.data))));
  }
  if (payload.v !== 2 || payload.cipher !== 'AES-256-GCM') throw new Error('Formato di cifratura non supportato');
  const key = await aesKey(await deriveBytes(password, unb64(payload.salt), payload.kdf));
  let out = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv), additionalData: headerAad(payload), tagLength: 128 }, key, unb64(payload.data)));
  if (payload.compressed) out = await gunzip(out);
  return JSON.parse(dec.decode(out));
}

/** Confronto a tempo costante */
export function safeEqual(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

export async function hashPin(pin, saltB64 = null, kdf = null) {
  const salt = saltB64 ? unb64(saltB64) : randBytes(16);
  const useKdf = kdf || ((await argonAvailable()) ? KDF_PIN : { name: 'pbkdf2-sha256', iter: 600000 });
  const bits = await deriveBytes(pin, salt, useKdf);
  return { hash: b64(bits), salt: b64(salt), kdf: useKdf };
}

/** Robustezza password: 0 (debolissima) – 4 (ottima) con stima dell'entropia */
const COMMON = ['password', 'qwerty', '123456', 'ciao', 'amore', 'juventus', 'inter', 'milan', 'napoli', 'roma', 'iloveyou', 'admin', 'vita', 'backup', 'abc'];
export function passwordStrength(pw) {
  const s = String(pw || '');
  if (!s) return { score: 0, bits: 0, label: 'Vuota' };
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/\d/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(s)) pool += 33;
  let bits = s.length * Math.log2(pool || 1);
  const words = s.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  if (words.length >= 4) bits = Math.max(bits, words.length * 11);
  if (/(.)\1{2,}/.test(s)) bits *= 0.75;
  if (/^(?:0123|1234|2345|abcd|qwer)/i.test(s)) bits *= 0.6;
  if (COMMON.some((c) => s.toLowerCase().includes(c))) bits *= 0.6;
  const score = bits >= 80 ? 4 : bits >= 60 ? 3 : bits >= 40 ? 2 : bits >= 25 ? 1 : 0;
  return { score, bits: Math.round(bits), label: ['Debolissima', 'Debole', 'Discreta', 'Forte', 'Ottima'][score] };
}
