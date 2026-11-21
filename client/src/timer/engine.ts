/**
 * Ablauf-Logik für Workouts und Stretchings.
 *
 * Ein Plan wird zuerst in eine flache Liste von Schritten (Countdown, Übung, Pause)
 * übersetzt. Der Laufzustand speichert nur Zeitstempel; die verbleibende Zeit wird
 * bei jedem Tick aus der aktuellen Uhrzeit berechnet. Dadurch weicht der Timer nicht
 * ab, auch wenn der Browser Intervalle im Hintergrund drosselt.
 */

export const COUNTDOWN_SEC = 5;
export const BEEP_LAST_SEC = 5;

export type Phase = 'countdown' | 'work' | 'rest';
export type Mode = 'time' | 'reps';

export interface ExerciseInfo {
  name: string;
  image: string | null;
  description?: string;
  mode: Mode;
  /** Sekunden (Zeit) bzw. Anzahl Wiederholungen */
  value: number;
  round: number;
  totalRounds: number;
  set: number;
  totalSets: number;
}

export interface Step {
  phase: Phase;
  /** Dauer in Sekunden. 0 = wartet auf „Next“ (Wiederholungs-Übung). */
  duration: number;
  /** countdown/work: die betreffende Übung; rest: die danach folgende Übung */
  exercise: ExerciseInfo;
  restKind?: 'exercise' | 'round';
}

export interface WorkoutPlan {
  rounds: number;
  restBetweenExercises: number;
  restBetweenRounds: number;
  items: { name: string; image: string | null; description?: string; type: Mode; value: number; sets: number }[];
}

export interface StretchingPlan {
  items: { name: string; image: string | null; durationSec: number }[];
}

/**
 * Reihenfolge: Runde → Eintrag → Satz. Vor jedem Satz ein 5-s-Countdown.
 * Zwischen zwei Sätzen/Einträgen die Pause zwischen Übungen, am Rundenende
 * die Pause zwischen Runden. Nach dem allerletzten Satz keine Pause.
 */
export function buildWorkoutSteps(plan: WorkoutPlan): Step[] {
  const units: ExerciseInfo[] = [];
  const rounds = Math.max(1, plan.rounds);
  for (let round = 1; round <= rounds; round++) {
    for (const item of plan.items) {
      const sets = Math.max(1, item.sets);
      for (let set = 1; set <= sets; set++) {
        units.push({
          name: item.name,
          image: item.image,
          description: item.description,
          mode: item.type,
          value: item.value,
          round,
          totalRounds: rounds,
          set,
          totalSets: sets,
        });
      }
    }
  }

  const steps: Step[] = [];
  units.forEach((unit, k) => {
    steps.push({ phase: 'countdown', duration: COUNTDOWN_SEC, exercise: unit });
    steps.push({ phase: 'work', duration: unit.mode === 'time' ? unit.value : 0, exercise: unit });
    const next = units[k + 1];
    if (next) {
      const roundEnd = next.round !== unit.round;
      const rest = roundEnd ? plan.restBetweenRounds : plan.restBetweenExercises;
      if (rest > 0) {
        steps.push({ phase: 'rest', duration: rest, exercise: next, restKind: roundEnd ? 'round' : 'exercise' });
      }
    }
  });
  return steps;
}

export function buildStretchingSteps(plan: StretchingPlan): Step[] {
  const total = plan.items.length;
  return plan.items.flatMap((item, i) => {
    const exercise: ExerciseInfo = {
      name: item.name,
      image: item.image,
      mode: 'time',
      value: item.durationSec,
      round: 1,
      totalRounds: 1,
      set: i + 1,
      totalSets: total,
    };
    return [
      { phase: 'countdown' as const, duration: COUNTDOWN_SEC, exercise },
      { phase: 'work' as const, duration: item.durationSec, exercise },
    ];
  });
}

/** Geschätzte Gesamtdauer in Sekunden (Wiederholungs-Übungen zählen nicht mit). */
export function estimateDuration(steps: Step[]): { seconds: number; hasReps: boolean } {
  return {
    seconds: steps.reduce((s, st) => s + st.duration, 0),
    hasReps: steps.some((st) => st.phase === 'work' && st.duration === 0),
  };
}

/** Die Übung, die nach der aktuell angezeigten Übung kommt (für die Vorschau). */
export function upcomingExercise(steps: Step[], index: number): ExerciseInfo | null {
  const step = steps[index];
  if (!step) return null;
  // Index des Arbeitsschritts, der gerade „im Fokus“ ist
  let focus = index;
  if (step.phase !== 'work') {
    focus = steps.findIndex((s, i) => i > index && s.phase === 'work');
    if (focus < 0) return null;
  }
  const next = steps.find((s, i) => i > focus && s.phase === 'work');
  return next ? next.exercise : null;
}

// ---------------- Laufzustand ----------------

export interface RunState {
  index: number;
  /** Zeitpunkt (ms), an dem der aktuelle Schritt begonnen hat – um Pausen verschoben */
  stepStartedAt: number;
  startedAt: number;
  pausedAt: number | null;
  /** Summe aller abgeschlossenen Pausen in ms */
  pausedTotal: number;
  finishedAt: number | null;
}

export function startRun(steps: Step[], now: number): RunState {
  return {
    index: 0,
    stepStartedAt: now,
    startedAt: now,
    pausedAt: null,
    pausedTotal: 0,
    finishedAt: steps.length === 0 ? now : null,
  };
}

const effectiveNow = (s: RunState, now: number) => s.finishedAt ?? s.pausedAt ?? now;

export function stepElapsedMs(s: RunState, now: number): number {
  return Math.max(0, effectiveNow(s, now) - s.stepStartedAt);
}

/** Verbleibende Zeit des aktuellen Schritts in ms, oder null bei Wiederholungs-Übungen. */
export function remainingMs(s: RunState, steps: Step[], now: number): number | null {
  const step = steps[s.index];
  if (!step || step.duration <= 0) return null;
  return Math.max(0, step.duration * 1000 - stepElapsedMs(s, now));
}

/** Aktive Trainingsdauer in ms (ohne Pausen). */
export function activeMs(s: RunState, now: number): number {
  return Math.max(0, effectiveNow(s, now) - s.startedAt - s.pausedTotal);
}

/**
 * Schaltet abgelaufene Zeit-Schritte weiter. Auch mehrere auf einmal, falls der
 * Tab länger im Hintergrund war. Bei Wiederholungs-Übungen wird gewartet.
 */
export function tick(s: RunState, steps: Step[], now: number): RunState {
  if (s.finishedAt !== null || s.pausedAt !== null) return s;
  let index = s.index;
  let stepStartedAt = s.stepStartedAt;
  while (index < steps.length) {
    const step = steps[index];
    if (step.duration <= 0) break;
    const end = stepStartedAt + step.duration * 1000;
    if (now < end) break;
    index++;
    stepStartedAt = end;
  }
  if (index === s.index) return s;
  return { ...s, index, stepStartedAt, finishedAt: index >= steps.length ? stepStartedAt : null };
}

export function goTo(s: RunState, steps: Step[], target: number, now: number): RunState {
  if (s.finishedAt !== null) return s;
  const at = s.pausedAt ?? now;
  if (target >= steps.length) return { ...s, index: steps.length, stepStartedAt: at, finishedAt: at };
  return { ...s, index: Math.max(0, target), stepStartedAt: at };
}

/** „Next“ bei Wiederholungs-Übungen. */
export function next(s: RunState, steps: Step[], now: number): RunState {
  return goTo(s, steps, s.index + 1, now);
}

/** Überspringen: Countdown/Übung → direkt hinter die Übung; Pause → nächster Schritt. */
export function skipTarget(steps: Step[], index: number): number {
  const step = steps[index];
  if (!step) return index;
  if (step.phase === 'countdown') return steps[index + 1]?.phase === 'work' ? index + 2 : index + 1;
  return index + 1;
}

export function skip(s: RunState, steps: Step[], now: number): RunState {
  return goTo(s, steps, skipTarget(steps, s.index), now);
}

export function pause(s: RunState, now: number): RunState {
  if (s.pausedAt !== null || s.finishedAt !== null) return s;
  return { ...s, pausedAt: now };
}

export function resume(s: RunState, now: number): RunState {
  if (s.pausedAt === null) return s;
  const delta = Math.max(0, now - s.pausedAt);
  return { ...s, pausedAt: null, stepStartedAt: s.stepStartedAt + delta, pausedTotal: s.pausedTotal + delta };
}

// ---------------- Töne ----------------

export type Cue = { kind: 'tick'; key: string } | { kind: 'start'; key: string } | null;

/**
 * Welcher Ton jetzt fällig ist. Jeder Ton hat einen eindeutigen Schlüssel, damit er
 * nur einmal gespielt wird. Töne, deren Zeitpunkt mehr als ~0,5 s zurückliegt
 * (z. B. nach dem Zurückkehren aus dem Hintergrund), werden nicht nachgeholt.
 */
export function cueFor(s: RunState, steps: Step[], now: number): Cue {
  if (s.finishedAt !== null || s.pausedAt !== null) return null;
  const step = steps[s.index];
  if (!step) return null;
  const elapsed = stepElapsedMs(s, now);
  if (step.phase === 'work' && s.index > 0 && steps[s.index - 1].phase === 'countdown' && elapsed < 500) {
    return { kind: 'start', key: `${s.index}-start` };
  }
  const rem = remainingMs(s, steps, now);
  if (rem === null || rem <= 0) return null;
  const sec = Math.ceil(rem / 1000);
  if (sec > BEEP_LAST_SEC) return null;
  const intoSecond = sec * 1000 - rem;
  if (intoSecond > 500) return null;
  return { kind: 'tick', key: `${s.index}-${sec}` };
}
