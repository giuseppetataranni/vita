/* Service worker di Vita: cache offline versionata, push, click sulle notifiche */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = 'vita-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('vita-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'VERSION') e.source && e.source.postMessage({ type: 'VERSION', version: VERSION });
  if (e.data && e.data.type === 'NOTIFY') {
    const d = e.data;
    self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: './icons/icon-192.png', data: { url: d.url || './' } });
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // sempre dalla rete
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }))
  );
});

// Legge la chiave dei promemoria dall'archivio dell'app (non lascia mai il telefono)
function vitaPushKey() {
  return new Promise((resolve) => {
    const req = indexedDB.open('vita');
    req.onupgradeneeded = () => req.transaction.abort();
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const g = req.result.transaction('settings', 'readonly').objectStore('settings').get('pushKey');
        g.onsuccess = () => { resolve(g.result ? g.result.value : null); req.result.close(); };
        g.onerror = () => resolve(null);
      } catch { resolve(null); }
    };
  });
}
async function vitaDecrypt(keyB64, enc) {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
    if (d.enc) {
      try { d = { ...(await vitaDecrypt(await vitaPushKey(), d.enc)), tag: d.tag }; }
      catch { d = { title: 'Vita', body: 'Hai un promemoria', tag: d.tag }; }
    }
    await self.registration.showNotification(d.title || 'Vita', {
      body: d.body || '',
      tag: d.tag || undefined,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: d.url || './' }
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'NAVIGATE', url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
