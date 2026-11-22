import type { PlanEntry } from '../types';

export type Focus = 'ausdauer' | 'kraft' | 'beweglichkeit' | 'ausgewogen';

export const FOCUS_OPTIONS: { id: Focus; label: string; text: string }[] = [
  { id: 'ausgewogen', label: 'Ausgewogen', text: 'Laufen, Kraft und Dehnen im Wechsel' },
  { id: 'ausdauer', label: 'Ausdauer', text: 'Schwerpunkt Laufen, ergänzt durch Kraft' },
  { id: 'kraft', label: 'Kraft', text: 'Schwerpunkt Workouts, danach Dehnen' },
  { id: 'beweglichkeit', label: 'Beweglichkeit', text: 'Schwerpunkt Stretching' },
];

/** Trainingstage je Anzahl pro Woche – möglichst gleichmäßig verteilt (1 = Mo … 7 = So) */
export const TRAINING_DAYS: Record<number, number[]> = {
  1: [3],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 2, 4, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

type Main = 'run' | 'workout' | 'stretching';

/** Reihenfolge der Haupteinheiten je Schwerpunkt; die ersten n Tage werden verwendet. */
const SEQUENCES: Record<Focus, Main[]> = {
  ausgewogen: ['run', 'workout', 'stretching', 'run', 'workout', 'run', 'stretching'],
  ausdauer: ['run', 'workout', 'run', 'run', 'workout', 'run', 'stretching'],
  kraft: ['workout', 'run', 'workout', 'workout', 'run', 'workout', 'stretching'],
  beweglichkeit: ['stretching', 'run', 'stretching', 'workout', 'stretching', 'run', 'stretching'],
};

export interface RecommendInput {
  daysPerWeek: number;
  focus: Focus;
  workouts: { id: number; name: string }[];
  stretchings: { id: number; name: string }[];
  /** Aktivität „Laufen“ (oder eine andere Ausdauer-Aktivität) */
  run: { id: number; name: string; icon: string } | null;
  /** Ziel fürs Laufen in Minuten */
  runMinutes: number;
}

/**
 * Erzeugt ein Wochenmuster. Workouts und Stretchings werden reihum aus den vorhandenen
 * gewählt; gibt es keine, bleibt der Eintrag „nach Wahl“.
 */
export function recommendPattern(input: RecommendInput): PlanEntry[] {
  const days = TRAINING_DAYS[Math.min(7, Math.max(1, input.daysPerWeek))];
  const sequence = SEQUENCES[input.focus];
  let wi = 0;
  let si = 0;
  const workout = (weekday: number): PlanEntry => {
    const w = input.workouts.length ? input.workouts[wi++ % input.workouts.length] : null;
    return { ...blank(weekday, 'workout'), workoutId: w?.id ?? null, workoutName: w?.name ?? null };
  };
  const stretching = (weekday: number): PlanEntry => {
    const s = input.stretchings.length ? input.stretchings[si++ % input.stretchings.length] : null;
    return { ...blank(weekday, 'stretching'), stretchingId: s?.id ?? null, stretchingName: s?.name ?? null };
  };

  const entries: PlanEntry[] = [];
  days.forEach((weekday, i) => {
    let main = sequence[i];
    if (main === 'run' && !input.run) main = 'workout';
    if (main === 'run') {
      entries.push({
        ...blank(weekday, 'activity'),
        activityTypeId: input.run!.id,
        activityName: input.run!.name,
        activityIcon: input.run!.icon,
        targetType: 'duration',
        targetValue: input.runMinutes,
      });
      // Bei Schwerpunkt Beweglichkeit nach dem Laufen dehnen
      if (input.focus === 'beweglichkeit') entries.push(stretching(weekday));
    } else if (main === 'workout') {
      entries.push(workout(weekday));
      // Nach Kraft-Workouts dehnen (außer Schwerpunkt Ausdauer)
      if (input.focus !== 'ausdauer') entries.push(stretching(weekday));
    } else {
      entries.push(stretching(weekday));
    }
  });
  return entries;
}

export const defaultRunMinutes = (focus: Focus) => (focus === 'ausdauer' ? 30 : 20);

function blank(weekday: number, kind: PlanEntry['kind']): PlanEntry {
  return {
    week: 0,
    weekday,
    kind,
    workoutId: null,
    stretchingId: null,
    activityTypeId: null,
    targetType: null,
    targetValue: null,
  };
}
