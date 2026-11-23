import { settings } from './db.js';

export function applyTheme() {
  const root = document.documentElement;
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', settings.accent || '#0a84ff');
  root.style.setProperty('--text-scale', String(settings.textScale || 1));
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f2f2f7'));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'auto' && applyTheme());

export const ACCENTS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff9f0a', '#30d158', '#00c7be', '#8e8e93'];
