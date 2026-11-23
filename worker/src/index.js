// Vita – server promemoria (Cloudflare Worker, piano gratuito)
// 1) Web Push cifrato (RFC 8291 aes128gcm + VAPID RFC 8292) inviato ogni minuto dal cron
// 2) Ponte per leggere calendari .ics (Google/iCloud/Outlook) aggirando il blocco CORS
// Privacy: i promemoria arrivano già cifrati dal telefono (il server vede solo gli orari),
// i calendari passano senza essere salvati, nessun log permanente.
// Nessuna libreria esterna: solo Web Crypto.

const te = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** Cifra il payload per una sottoscrizione push (RFC 8291) */
export async function encryptPayload(subscription, payload) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(te.encode(payload), new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, body);
}

/** Intestazione Authorization VAPID (JWT ES256) */
export async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const h = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://github.com' })));
  const pub = unb64u(env.VAPID_PUBLIC_KEY);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${h}.${p}`));
  return `vapid t=${h}.${p}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export async function sendPush(subscription, message, env) {
  const body = await encryptPayload(subscription, JSON.stringify(message));
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(subscription.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body
  });
}

// ---------- Stato (un'unica chiave KV: poche scritture, adatto al piano gratuito) ----------
const loadState = async (env) => (await env.STORE.get('state', 'json')) || { devices: {} };
const saveState = (env, s) => env.STORE.put('state', JSON.stringify(s));

function safeEqual(a, b) {
  const x = te.encode(String(a)), y = te.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin'
});
const json = (data, env, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors(env) } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('Vita worker attivo', { headers: cors(env) });
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!env.APP_TOKEN || !safeEqual(token, env.APP_TOKEN)) return json({ error: 'non autorizzato' }, env, 401);

    try {
      if (url.pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY }, env);

      if (url.pathname === '/ics' && req.method === 'POST') {
        const { url: raw } = await req.json();
        const target = String(raw || '').replace(/^webcal:/i, 'https:');
        if (!/^https:\/\//i.test(target)) return json({ error: 'URL non valido' }, env, 400);
        const r = await fetch(target, { headers: { 'user-agent': 'Vita-Calendar/1.0', accept: 'text/calendar, */*' }, redirect: 'follow' });
        if (!r.ok) return json({ error: `il calendario ha risposto ${r.status}` }, env, 502);
        const text = await r.text();
        if (text.length > 8_000_000) return json({ error: 'calendario troppo grande' }, env, 413);
        return new Response(text, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store', ...cors(env) } });
      }

      if (req.method !== 'POST') return json({ error: 'metodo non consentito' }, env, 405);
      const body = await req.json();
      const id = String(body.deviceId || '').slice(0, 64);
      if (!id) return json({ error: 'deviceId mancante' }, env, 400);
      const state = await loadState(env);

      if (url.pathname === '/subscribe') {
        if (!body.subscription?.endpoint || !body.subscription?.keys) return json({ error: 'sottoscrizione non valida' }, env, 400);
        state.devices[id] = { ...(state.devices[id] || { reminders: [] }), subscription: body.subscription, updatedAt: Date.now() };
        await saveState(env, state);
        return json({ ok: true }, env);
      }
      if (url.pathname === '/unsubscribe') {
        delete state.devices[id];
        await saveState(env, state);
        return json({ ok: true }, env);
      }
      if (url.pathname === '/reminders') {
        if (!state.devices[id]) return json({ error: 'dispositivo non registrato: riattiva le notifiche in background' }, env, 404);
        const now = Date.now();
        state.devices[id].reminders = (body.reminders || [])
          .filter((r) => Number(r.at) > now - 60000)
          .slice(0, 500)
          .filter((r) => typeof r.enc === 'string' && r.enc.length < 3000)
          .map((r) => ({ id: String(r.id).slice(0, 40), at: Number(r.at), enc: r.enc })); // solo dati cifrati: il server non può leggerli
        state.devices[id].updatedAt = now;
        await saveState(env, state);
        return json({ ok: true, count: state.devices[id].reminders.length }, env);
      }
      if (url.pathname === '/test') {
        const d = state.devices[id];
        if (!d) return json({ error: 'dispositivo non registrato' }, env, 404);
        const r = await sendPush(d.subscription, { title: '🔔 Vita', body: 'Le notifiche in background funzionano.', tag: 'test', url: './#/impostazioni' }, env);
        return json({ ok: r.ok, status: r.status }, env, r.ok ? 200 : 502);
      }
      return json({ error: 'non trovato' }, env, 404);
    } catch (e) {
      return json({ error: e.message }, env, 500);
    }
  },

  // Ogni minuto: invia i promemoria che cadono in questo minuto
  async scheduled(event, env, ctx) {
    const state = await loadState(env);
    const from = Math.floor(event.scheduledTime / 60000) * 60000, to = from + 60000;
    let dirty = false;
    const jobs = [];
    for (const [id, d] of Object.entries(state.devices)) {
      for (const r of d.reminders || []) {
        if (r.at >= from && r.at < to) {
          jobs.push(sendPush(d.subscription, { enc: r.enc, tag: r.id }, env).then((res) => {
            if (res.status === 404 || res.status === 410) { delete state.devices[id]; dirty = true; }
          }).catch(() => {}));
        }
      }
    }
    await Promise.all(jobs);
    if (dirty) ctx.waitUntil(saveState(env, state));
  }
};
