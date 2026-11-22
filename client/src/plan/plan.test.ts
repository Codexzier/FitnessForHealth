import { describe, expect, it } from 'vitest';
import type { Plan, PlanEntry } from '../types';
import { recommendPattern, TRAINING_DAYS } from './recommend';
import { allDays, dateOf, entriesForDate, nextMonday, progress, todayISO, weekOf, weekdayOf } from './schedule';

const entry = (id: number, week: number, weekday: number, kind: PlanEntry['kind'] = 'activity'): PlanEntry => ({
  id,
  week,
  weekday,
  kind,
  workoutId: null,
  stretchingId: null,
  activityTypeId: kind === 'activity' ? 1 : null,
  targetType: null,
  targetValue: null,
});

const plan: Plan = {
  id: 1,
  name: 'Test',
  weeks: 3,
  startDate: '2026-11-23', // Montag
  active: true,
  entries: [entry(1, 0, 1), entry(2, 0, 3, 'workout'), entry(3, 2, 3, 'stretching')],
  overrides: [
    { week: 2, weekday: 3 },
    { week: 3, weekday: 1 }, // Ruhetag statt Laufen
  ],
  completions: [{ entryId: 1, date: '2026-11-23', executionId: 1 }],
};

describe('Zeitplan', () => {
  it('rechnet Wochentage, Wochen und Daten', () => {
    expect(weekdayOf('2026-11-22')).toBe(7);
    expect(weekOf('2026-11-23', '2026-12-06')).toBe(2);
    expect(nextMonday('2026-11-22')).toBe('2026-11-23');
    expect(nextMonday('2026-11-23')).toBe('2026-11-23');
    expect(dateOf(plan, 2, 3)).toBe('2026-12-02');
    // Plan, der an einem Mittwoch beginnt
    expect(dateOf({ startDate: '2026-11-25' }, 1, 1)).toBe('2026-11-30');
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('nutzt Abweichungen einzelner Wochen statt des Musters', () => {
    expect(entriesForDate(plan, '2026-11-25')!.entries.map((e) => e.id)).toEqual([2]);
    expect(entriesForDate(plan, '2026-12-02')!.entries.map((e) => e.id)).toEqual([3]);
    expect(entriesForDate(plan, '2026-12-07')!.entries).toEqual([]); // Woche 3, Montag: Ruhetag
    expect(entriesForDate(plan, '2026-12-14')).toBeNull(); // nach Planende
    expect(entriesForDate(plan, '2026-11-22')).toBeNull(); // vor Planstart
  });

  it('zählt den Fortschritt', () => {
    expect(allDays(plan)).toHaveLength(21);
    // Mo W1, Mi W1, Mo W2, Mi W2 (Stretching), Mi W3 → 5
    expect(progress(plan, '2026-11-26')).toEqual({ total: 5, due: 2, done: 1 });
  });
});

describe('Empfehlung', () => {
  const base = {
    workouts: [
      { id: 10, name: 'Oberkörper' },
      { id: 11, name: 'Beine' },
    ],
    stretchings: [{ id: 20, name: 'Abends' }],
    run: { id: 1, name: 'Laufen', icon: '🏃' },
    runMinutes: 25,
  };

  it('verteilt die Trainingstage gleichmäßig', () => {
    for (let n = 1; n <= 7; n++) {
      const days = new Set(recommendPattern({ ...base, daysPerWeek: n, focus: 'ausgewogen' }).map((e) => e.weekday));
      expect([...days].sort()).toEqual(TRAINING_DAYS[n]);
    }
  });

  it('plant ausgewogen: Laufen, Workout + Dehnen, Stretching', () => {
    const entries = recommendPattern({ ...base, daysPerWeek: 3, focus: 'ausgewogen' });
    expect(entries.map((e) => `${e.weekday}:${e.kind}`)).toEqual(['1:activity', '3:workout', '3:stretching', '5:stretching']);
    expect(entries[0]).toMatchObject({ activityTypeId: 1, targetType: 'duration', targetValue: 25 });
  });

  it('wechselt die Workouts reihum und lässt ohne Laufen-Aktivität Workouts laufen', () => {
    const entries = recommendPattern({ ...base, run: null, daysPerWeek: 4, focus: 'kraft' });
    const workouts = entries.filter((e) => e.kind === 'workout').map((e) => e.workoutId);
    expect(workouts).toEqual([10, 11, 10, 11]);
    expect(entries.some((e) => e.kind === 'activity')).toBe(false);
  });

  it('lässt Einträge „nach Wahl“, wenn es noch keine Workouts gibt', () => {
    const entries = recommendPattern({ ...base, workouts: [], stretchings: [], daysPerWeek: 2, focus: 'ausdauer' });
    expect(entries.map((e) => [e.kind, e.workoutId])).toEqual([
      ['activity', null],
      ['workout', null],
    ]);
  });
});
