import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { newPushKey, sealReminder, openReminder, opaqueId } from '../src/lib/pushcrypto.js';

const swSrc = fs.readFileSync('src/sw.js', 'utf8').match(/async function vitaDecrypt[\s\S]*?\n}\n/)[0];
const swDecrypt = new Function(`${swSrc}; return vitaDecrypt;`)();

describe('promemoria cifrati end-to-end', () => {
  it('il server riceve solo testo illeggibile', async () => {
    const k = newPushKey();
    const msg = { title: 'Dentista', body: '09:30 · Studio Rossi', url: '#/calendario' };
    const enc = await sealReminder(k, msg);
    expect(enc).not.toContain('Dentista');
    expect(await openReminder(k, enc)).toEqual(msg);
    expect(await swDecrypt(k, enc)).toEqual(msg); // lo stesso dato viene decifrato dal service worker
    await expect(openReminder(newPushKey(), enc)).rejects.toThrow();
  });
  it('identificativi opachi e stabili', async () => {
    const k = newPushKey();
    const a = await opaqueId(k, 'ev-12@1763459400000');
    expect(a).toBe(await opaqueId(k, 'ev-12@1763459400000'));
    expect(a).not.toContain('ev');
    expect(a).not.toBe(await opaqueId(newPushKey(), 'ev-12@1763459400000'));
  });
});
