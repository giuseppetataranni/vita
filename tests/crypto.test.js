import { describe, it, expect } from 'vitest';
import { encryptJson, decryptJson, hashPin, safeEqual, passwordStrength, KDF_FALLBACK } from '../src/lib/crypto.js';

const data = { format: 'vita-backup', tables: { notes: [{ id: 1, title: 'Segreto', text: 'àèìòù 💶'.repeat(50) }] } };

describe('cifratura', () => {
  it('Argon2id + AES-256-GCM: andata e ritorno', async () => {
    const enc = await encryptJson(data, 'cavallo batteria graffetta corretta');
    expect(enc.kdf.name).toBe('argon2id');
    expect(enc.kdf.m).toBe(65536);
    expect(enc.cipher).toBe('AES-256-GCM');
    expect(JSON.stringify(enc)).not.toContain('Segreto');
    expect(await decryptJson(enc, 'cavallo batteria graffetta corretta')).toEqual(data);
  }, 30000);
  it('password errata rifiutata', async () => {
    const enc = await encryptJson(data, 'giusta-password-123', { kdf: KDF_FALLBACK });
    await expect(decryptJson(enc, 'sbagliata')).rejects.toThrow();
  }, 30000);
  it('intestazione autenticata: parametri manomessi = errore', async () => {
    const enc = await encryptJson(data, 'pw-lunga-e-sicura!', { kdf: { name: 'argon2id', m: 1024, t: 1, p: 1 } });
    await expect(decryptJson({ ...enc, createdAt: '2000-01-01T00:00:00.000Z' }, 'pw-lunga-e-sicura!')).rejects.toThrow();
    const bytes = Uint8Array.from(atob(enc.data), (c) => c.charCodeAt(0)); bytes[5] ^= 1;
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    await expect(decryptJson({ ...enc, data: btoa(s) }, 'pw-lunga-e-sicura!')).rejects.toThrow();
  }, 30000);
  it('ogni cifratura usa sale e IV nuovi', async () => {
    const k = { name: 'argon2id', m: 1024, t: 1, p: 1 };
    const a = await encryptJson(data, 'x', { kdf: k }), b = await encryptJson(data, 'x', { kdf: k });
    expect(a.salt).not.toBe(b.salt); expect(a.iv).not.toBe(b.iv); expect(a.data).not.toBe(b.data);
  });
  it('PIN con Argon2id e confronto a tempo costante', async () => {
    const h = await hashPin('482915');
    expect(h.kdf.name).toBe('argon2id');
    const again = await hashPin('482915', h.salt, h.kdf);
    expect(safeEqual(again.hash, h.hash)).toBe(true);
    expect(safeEqual((await hashPin('482916', h.salt, h.kdf)).hash, h.hash)).toBe(false);
  }, 30000);
  it('robustezza password', () => {
    expect(passwordStrength('1234').score).toBe(0);
    expect(passwordStrength('password2026').score).toBeLessThan(3);
    expect(passwordStrength('Mare-Limone-Treno-Viola-27').score).toBeGreaterThanOrEqual(3);
  });
});
