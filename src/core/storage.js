// Persistenza dello storage e stato di installazione
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export async function storageInfo() {
  const info = { persisted: false, usage: 0, quota: 0 };
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) Object.assign(info, await navigator.storage.estimate());
  } catch { /* non supportato */ }
  return info;
}

export const bytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
