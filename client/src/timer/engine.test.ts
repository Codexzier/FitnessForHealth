import { describe, expect, it } from 'vitest';
import {
  activeMs,
  buildStretchingSteps,
  buildWorkoutSteps,
  cueFor,
  estimateDuration,
  next,
  pause,
  remainingMs,
  resume,
  skip,
  startRun,
  tick,
  upcomingExercise,
  type Step,
  type WorkoutPlan,
} from './engine';

const plan: WorkoutPlan = {
  rounds: 2,
  restBetweenExercises: 10,
  restBetweenRounds: 60,
  items: [
    { name: 'Kniebeuge', image: null, type: 'time', value: 30, sets: 2 },
    { name: 'Liegestütz', image: null, type: 'reps', value: 12, sets: 1 },
  ],
};

/** Kurzschreibweise: z. B. "C:Kniebeuge R1 S1/2" */
const describeStep = (s: Step) =>
  s.phase === 'rest'
    ? `P${s.restKind === 'round' ? 'R' : 'U'}${s.duration}→${s.exercise.name}`
    : `${s.phase === 'countdown' ? 'C' : 'W'}:${s.exercise.name} R${s.exercise.round} S${s.exercise.set}/${s.exercise.totalSets}`;

describe('buildWorkoutSteps', () => {
  it('führt Sätze direkt hintereinander aus, dann den nächsten Eintrag, dann die nächste Runde', () => {
    expect(buildWorkoutSteps(plan).map(describeStep)).toEqual([
      'C:Kniebeuge R1 S1/2',
      'W:Kniebeuge R1 S1/2',
      'PU10→Kniebeuge',
      'C:Kniebeuge R1 S2/2',
      'W:Kniebeuge R1 S2/2',
      'PU10→Liegestütz',
      'C:Liegestütz R1 S1/1',
      'W:Liegestütz R1 S1/1',
      'PR60→Kniebeuge',
      'C:Kniebeuge R2 S1/2',
      'W:Kniebeuge R2 S1/2',
      'PU10→Kniebeuge',
      'C:Kniebeuge R2 S2/2',
      'W:Kniebeuge R2 S2/2',
      'PU10→Liegestütz',
      'C:Liegestütz R2 S1/1',
      'W:Liegestütz R2 S1/1',
    ]);
  });

  it('lässt Pausen mit 0 Sekunden weg und setzt Dauer/Modus richtig', () => {
    const steps = buildWorkoutSteps({ ...plan, rounds: 1, restBetweenExercises: 0 });
    expect(steps.some((s) => s.phase === 'rest')).toBe(false);
    expect(steps.filter((s) => s.phase === 'countdown').every((s) => s.duration === 5)).toBe(true);
    const work = steps.filter((s) => s.phase === 'work');
    expect(work.map((s) => s.duration)).toEqual([30, 30, 0]);
    expect(work[2].exercise).toMatchObject({ mode: 'reps', value: 12 });
  });

  it('liefert bei leerem Workout keine Schritte', () => {
    expect(buildWorkoutSteps({ ...plan, items: [] })).toEqual([]);
  });

  it('schätzt die Dauer', () => {
    // 4×(5+30) Kniebeuge + 2×5 Countdown Liegestütz + Pausen 10×4 + 60
    expect(estimateDuration(buildWorkoutSteps(plan))).toEqual({ seconds: 140 + 10 + 40 + 60, hasReps: true });
  });
});

describe('buildStretchingSteps', () => {
  it('setzt vor jede Übung einen Countdown, ohne Pausen', () => {
    const steps = buildStretchingSteps({
      items: [
        { name: 'Wade', image: null, durationSec: 30 },
        { name: 'Hüfte', image: null, durationSec: 45 },
      ],
    });
    expect(steps.map((s) => `${s.phase}:${s.exercise.name}:${s.duration}`)).toEqual([
      'countdown:Wade:5',
      'work:Wade:30',
      'countdown:Hüfte:5',
      'work:Hüfte:45',
    ]);
  });
});

describe('upcomingExercise', () => {
  const steps = buildWorkoutSteps(plan);
  it('zeigt im Countdown und während der Übung den folgenden Satz bzw. die folgende Übung', () => {
    expect(upcomingExercise(steps, 0)).toMatchObject({ name: 'Kniebeuge', set: 2 });
    expect(upcomingExercise(steps, 1)).toMatchObject({ name: 'Kniebeuge', set: 2 });
    expect(upcomingExercise(steps, 4)).toMatchObject({ name: 'Liegestütz' });
  });
  it('zeigt in der Pause die Übung nach der kommenden', () => {
    expect(upcomingExercise(steps, 5)).toMatchObject({ name: 'Kniebeuge', round: 2 });
  });
  it('liefert am Ende null', () => {
    expect(upcomingExercise(steps, steps.length - 1)).toBeNull();
  });
});

describe('Laufzustand', () => {
  const steps = buildWorkoutSteps(plan);
  const t0 = 1_000_000;

  it('zählt Countdown und Zeit-Übung über Zeitstempel herunter und schaltet automatisch weiter', () => {
    let s = startRun(steps, t0);
    expect(remainingMs(s, steps, t0 + 2000)).toBe(3000);
    s = tick(s, steps, t0 + 5000);
    expect(s.index).toBe(1);
    expect(remainingMs(s, steps, t0 + 5000)).toBe(30000);
    s = tick(s, steps, t0 + 35000);
    expect(steps[s.index].phase).toBe('rest');
  });

  it('holt mehrere Schritte nach, wenn der Tab im Hintergrund war', () => {
    let s = startRun(steps, t0);
    // 5 + 30 + 10 + 5 = 50 s → mitten in Satz 2
    s = tick(s, steps, t0 + 52_000);
    expect(s.index).toBe(4);
    expect(remainingMs(s, steps, t0 + 52_000)).toBe(28_000);
  });

  it('wartet bei Wiederholungs-Übungen auf „Next“', () => {
    let s = startRun(steps, t0);
    s = tick(s, steps, t0 + 1_000_000);
    expect(s.index).toBe(7);
    expect(steps[7].exercise.mode).toBe('reps');
    expect(remainingMs(s, steps, t0 + 1_000_000)).toBeNull();
    s = next(s, steps, t0 + 1_000_000);
    expect(steps[s.index]).toMatchObject({ phase: 'rest', restKind: 'round' });
  });

  it('pausiert ohne Zeitverlust und rechnet Pausen aus der Dauer heraus', () => {
    let s = startRun(steps, t0);
    s = pause(s, t0 + 2000);
    expect(remainingMs(s, steps, t0 + 60_000)).toBe(3000);
    expect(tick(s, steps, t0 + 60_000).index).toBe(0);
    s = resume(s, t0 + 60_000);
    expect(remainingMs(s, steps, t0 + 60_000)).toBe(3000);
    expect(activeMs(s, t0 + 61_000)).toBe(3000);
  });

  it('überspringt Countdown samt Übung bzw. nur die Pause', () => {
    let s = startRun(steps, t0);
    s = skip(s, steps, t0 + 1000);
    expect(steps[s.index].phase).toBe('rest');
    s = skip(s, steps, t0 + 2000);
    expect(steps[s.index]).toMatchObject({ phase: 'countdown', exercise: { set: 2 } });
    expect(remainingMs(s, steps, t0 + 2000)).toBe(5000);
  });

  it('beendet nach dem letzten Schritt', () => {
    const st = buildStretchingSteps({ items: [{ name: 'Wade', image: null, durationSec: 10 }] });
    let s = startRun(st, t0);
    s = tick(s, st, t0 + 20_000);
    expect(s.finishedAt).toBe(t0 + 15_000);
    expect(activeMs(s, t0 + 99_000)).toBe(15_000);
  });
});

describe('Töne', () => {
  const steps = buildStretchingSteps({ items: [{ name: 'Wade', image: null, durationSec: 20 }] });
  const t0 = 0;

  it('piept im Countdown jede Sekunde und gibt beim Start einen eigenen Ton', () => {
    const s = startRun(steps, t0);
    const keys = [0, 1000, 2000, 3000, 4000].map((ms) => cueFor(s, steps, t0 + ms));
    expect(keys.map((c) => c?.kind)).toEqual(['tick', 'tick', 'tick', 'tick', 'tick']);
    expect(new Set(keys.map((c) => c?.key)).size).toBe(5);
    const w = tick(s, steps, t0 + 5000);
    expect(cueFor(w, steps, t0 + 5100)).toEqual({ kind: 'start', key: '1-start' });
  });

  it('piept während der Übung nur in den letzten 5 Sekunden', () => {
    const s = tick(startRun(steps, t0), steps, t0 + 5000);
    expect(cueFor(s, steps, t0 + 5000 + 10_000)).toBeNull();
    expect(cueFor(s, steps, t0 + 5000 + 14_900)).toBeNull();
    expect(cueFor(s, steps, t0 + 5000 + 15_000)).toEqual({ kind: 'tick', key: '1-5' });
    expect(cueFor(s, steps, t0 + 5000 + 19_000)).toEqual({ kind: 'tick', key: '1-1' });
  });

  it('holt verpasste Töne nicht nach', () => {
    const s = tick(startRun(steps, t0), steps, t0 + 5000);
    expect(cueFor(s, steps, t0 + 5000 + 15_800)).toBeNull();
  });
});
