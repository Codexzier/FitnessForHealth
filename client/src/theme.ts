import type { ColorMode, ThemeName } from './types';

export const THEMES: { id: ThemeName; label: string; colors: [string, string] }[] = [
  { id: 'standard', label: 'Grün (Standard)', colors: ['#16a34a', '#22c55e'] },
  { id: 'ozean', label: 'Ozean', colors: ['#0284c7', '#38bdf8'] },
  { id: 'sonnenuntergang', label: 'Sonnenuntergang', colors: ['#ea580c', '#fb923c'] },
  { id: 'lavendel', label: 'Lavendel', colors: ['#7c3aed', '#a78bfa'] },
  { id: 'kirsche', label: 'Kirsche', colors: ['#db2777', '#f472b6'] },
];

export const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: 'system', label: 'Wie System' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
];

const STORAGE_KEY = 'ffh-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current: { theme: ThemeName; mode: ColorMode } = { theme: 'standard', mode: 'system' };

function render() {
  const root = document.documentElement;
  const dark = current.mode === 'dark' || (current.mode === 'system' && !!media?.matches);
  root.dataset.theme = current.theme;
  root.dataset.scheme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

media?.addEventListener('change', render);

/** Setzt Theme und Hell/Dunkel-Modus und merkt sie sich für den nächsten Seitenaufruf. */
export function applyTheme(theme: ThemeName = 'standard', mode: ColorMode = 'system') {
  current = { theme, mode };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* privater Modus o. ä. */
  }
  render();
}

/** Beim Start: zuletzt verwendetes Theme sofort anwenden (verhindert Aufblitzen). */
export function restoreTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved?.theme) current = saved;
  } catch {
    /* ignorieren */
  }
  render();
}
