// Blocco app: PIN (PBKDF2) + Face ID/Touch ID via WebAuthn (verifica locale), blocco per inattività
import { settings, setSetting } from './db.js';
import { hashPin, randBytes, b64, unb64, safeEqual } from '../lib/crypto.js';
import { esc, icon, haptic } from './ui.js';

export const hasPin = () => !!settings.pinHash;
export const webauthnAvailable = async () => {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
};

export async function setPin(pin) {
  const { hash, salt, kdf } = await hashPin(pin);
  await setSetting('pinKdf', kdf);
  await setSetting('pinSalt', salt);
  await setSetting('pinLen', pin.length);
  await setSetting('pinHash', hash);
}
export async function clearPin() {
  await setSetting('pinHash', null); await setSetting('pinSalt', null); await setSetting('pinKdf', null); await setSetting('faceIdCred', null);
}
export async function verifyPin(pin) {
  if (!settings.pinHash) return true;
  const { hash } = await hashPin(pin, settings.pinSalt, settings.pinKdf || { name: 'pbkdf2-sha256', iter: 150000 });
  return safeEqual(hash, settings.pinHash);
}

export async function enrollFaceId() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randBytes(32),
      rp: { name: 'Vita', id: location.hostname },
      user: { id: randBytes(16), name: 'vita-utente', displayName: 'Vita' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none'
    }
  });
  await setSetting('faceIdCred', b64(cred.rawId));
}
export async function faceIdUnlock() {
  if (!settings.faceIdCred) return false;
  await navigator.credentials.get({
    publicKey: { challenge: randBytes(32), rpId: location.hostname, allowCredentials: [{ type: 'public-key', id: unb64(settings.faceIdCred), transports: ['internal'] }], userVerification: 'required', timeout: 60000 }
  });
  return true;
}

let locked = false;
export const isLocked = () => locked;

/** Mostra la schermata di blocco e risolve quando l'utente sblocca */
export function showLock() {
  if (locked || !hasPin()) return Promise.resolve();
  locked = true;
  document.body.classList.add('locked');
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'App bloccata');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', settings.faceIdCred ? 'face' : '', '0', 'del'];
    el.innerHTML = `<div class="lock-inner">${icon('lock', 'lock-ic')}<h2>Inserisci il codice</h2>
      <div class="pin-dots" aria-live="polite"></div><p class="lock-msg muted"></p>
      <div class="keypad">${keys.map((k) => k === '' ? '<span></span>' : `<button class="key ${k === 'face' || k === 'del' ? 'key-fn' : ''}" data-k="${k}" aria-label="${k === 'face' ? 'Sblocca con Face ID' : k === 'del' ? 'Cancella' : k}">${k === 'face' ? icon('faceid') : k === 'del' ? '⌫' : esc(k)}</button>`).join('')}</div></div>`;
    document.body.append(el);
    let pin = '', fails = Number(settings.pinFails || 0), until = Number(settings.pinLockUntil || 0), busy = false;
    const dots = el.querySelector('.pin-dots'), msg = el.querySelector('.lock-msg');
    const len = settings.pinLen || 4;
    const draw = () => { dots.innerHTML = Array.from({ length: len }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); };
    const done = () => { locked = false; setSetting('pinFails', 0); setSetting('pinLockUntil', 0); document.body.classList.remove('locked'); el.classList.add('out'); setTimeout(() => el.remove(), 250); resolve(); };
    const waitMsg = () => { const s = Math.ceil((until - Date.now()) / 1000); if (s > 0) { msg.textContent = `Troppi tentativi: riprova tra ${s > 90 ? Math.ceil(s / 60) + ' minuti' : s + ' secondi'}`; setTimeout(waitMsg, 1000); } else msg.textContent = ''; };
    if (until > Date.now()) waitMsg();
    const tryPin = async () => {
      if (Date.now() < until) { pin = ''; draw(); return; }
      busy = true; msg.textContent = 'Verifica…';
      const ok = await verifyPin(pin);
      busy = false; msg.textContent = '';
      if (ok) return done();
      fails++; await setSetting('pinFails', fails);
      dots.classList.add('shake'); setTimeout(() => dots.classList.remove('shake'), 400);
      pin = ''; draw();
      // Blocco progressivo: 5 errori -> 30 s, 8 -> 5 min, 10+ -> 30 min
      const wait = fails >= 10 ? 1800000 : fails >= 8 ? 300000 : fails >= 5 ? 30000 : 0;
      if (wait) { until = Date.now() + wait; await setSetting('pinLockUntil', until); waitMsg(); } else msg.textContent = 'Codice errato';
    };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || busy) return;
      haptic();
      const k = b.dataset.k;
      if (k === 'del') pin = pin.slice(0, -1);
      else if (k === 'face') { try { if (await faceIdUnlock()) return done(); } catch { msg.textContent = 'Face ID non riuscito: usa il codice'; } }
      else if (pin.length < len) pin += k;
      draw();
      if (pin.length === len) tryPin();
    });
    draw();
  });
}

/** Blocco automatico dopo inattività o quando l'app torna in primo piano dopo N minuti */
export function initAutoLock() {
  let last = Date.now(), hiddenAt = 0;
  const bump = () => { last = Date.now(); };
  ['touchstart', 'keydown', 'click', 'scroll'].forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); document.body.classList.add('privacy'); }
    else {
      document.body.classList.remove('privacy');
      if (hasPin() && settings.autoLockMin >= 0 && Date.now() - hiddenAt >= settings.autoLockMin * 60000) showLock();
    }
  });
  setInterval(() => {
    if (hasPin() && settings.autoLockMin > 0 && !locked && Date.now() - last > settings.autoLockMin * 60000) showLock();
  }, 15000);
}
