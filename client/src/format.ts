import type { Rating } from './types';

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** „ca. 12 Min“ für Übersichten */
export function formatMinutes(totalSec: number): string {
  if (totalSec < 60) return `${totalSec} Sek`;
  return `${Math.round(totalSec / 60)} Min`;
}

export const ratingLabel: Record<Rating, string> = { bad: 'Schlecht', medium: 'Mittel', good: 'Gut' };

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
