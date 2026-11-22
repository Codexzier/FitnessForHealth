import type { Plan, PlanEntry } from '../types';

/** Datumslogik des Trainingsplans. Daten sind Kalendertage im Format JJJJ-MM-TT. */

const DAY_MS = 24 * 3600 * 1000;

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function parse(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Heutiges Datum in der lokalen Zeitzone */
export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const addDays = (date: string, days: number) => format(parse(date) + days * DAY_MS);

/** 1 = Montag … 7 = Sonntag */
export const weekdayOf = (date: string) => ((new Date(parse(date)).getUTCDay() + 6) % 7) + 1;

/** Woche im Plan, 1-basiert */
export const weekOf = (startDate: string, date: string) => Math.floor((parse(date) - parse(startDate)) / DAY_MS / 7) + 1;

export const endDate = (plan: { startDate: string; weeks: number }) => addDays(plan.startDate, plan.weeks * 7 - 1);

/** Nächster Montag (oder heute, wenn heute Montag ist) – Vorschlag für den Planstart */
export function nextMonday(today = todayISO()): string {
  const wd = weekdayOf(today);
  return wd === 1 ? today : addDays(today, 8 - wd);
}

/** Datum eines Wochentags in einer Planwoche */
export function dateOf(plan: { startDate: string }, week: number, weekday: number): string {
  const startWd = weekdayOf(plan.startDate);
  // Planwochen beginnen am Starttag; der Tag mit passendem Wochentag liegt 0–6 Tage danach
  const offset = (weekday - startWd + 7) % 7;
  return addDays(plan.startDate, (week - 1) * 7 + offset);
}

export const isOverridden = (plan: Pick<Plan, 'overrides'>, week: number, weekday: number) =>
  plan.overrides.some((o) => o.week === week && o.weekday === weekday);

/** Einträge eines Tages: die Abweichung der Woche, falls vorhanden, sonst das Wochenmuster. */
export function entriesFor(plan: Pick<Plan, 'entries' | 'overrides'>, week: number, weekday: number): PlanEntry[] {
  const w = isOverridden(plan, week, weekday) ? week : 0;
  return plan.entries.filter((e) => e.week === w && e.weekday === weekday);
}

export function entriesForDate(plan: Plan, date: string): { week: number; weekday: number; entries: PlanEntry[] } | null {
  const week = weekOf(plan.startDate, date);
  if (week < 1 || week > plan.weeks) return null;
  const weekday = weekdayOf(date);
  return { week, weekday, entries: entriesFor(plan, week, weekday) };
}

export const isDone = (plan: Pick<Plan, 'completions'>, entryId: number | undefined, date: string) =>
  entryId !== undefined && plan.completions.some((c) => c.entryId === entryId && c.date === date);

/** Alle Tage des Plans mit Einträgen */
export function allDays(plan: Plan): { date: string; week: number; weekday: number; entries: PlanEntry[] }[] {
  const days = [];
  for (let i = 0; i < plan.weeks * 7; i++) {
    const date = addDays(plan.startDate, i);
    const d = entriesForDate(plan, date)!;
    days.push({ date, ...d });
  }
  return days;
}

/** Fortschritt: erledigte Einträge im Verhältnis zu allen bzw. zu den bis heute fälligen */
export function progress(plan: Plan, today = todayISO()) {
  let total = 0;
  let due = 0;
  let done = 0;
  for (const day of allDays(plan)) {
    for (const e of day.entries) {
      total++;
      if (day.date <= today) due++;
      if (isDone(plan, e.id, day.date)) done++;
    }
  }
  return { total, due, done };
}

export function entryTitle(e: PlanEntry): string {
  if (e.kind === 'workout') return e.workoutName ?? 'Workout nach Wahl';
  if (e.kind === 'stretching') return e.stretchingName ?? 'Stretching nach Wahl';
  return e.activityName ?? 'Aktivität';
}

export function entryIcon(e: PlanEntry): string {
  if (e.kind === 'workout') return '🏋️';
  if (e.kind === 'stretching') return '🧘';
  return e.activityIcon ?? '🏃';
}

export function targetText(e: PlanEntry): string | null {
  if (e.kind !== 'activity' || !e.targetType || !e.targetValue) return null;
  return e.targetType === 'duration'
    ? `${e.targetValue} Min`
    : `${String(e.targetValue).replace('.', ',')} km`;
}

export function formatDay(date: string): string {
  const [y, m, d] = date.split('-');
  return `${WEEKDAYS_SHORT[weekdayOf(date) - 1]}, ${d}.${m}.${y}`;
}
