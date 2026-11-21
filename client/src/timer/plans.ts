import { imageUrl } from '../api';
import type { Stretching, Workout } from '../types';
import type { StretchingPlan, WorkoutPlan } from './engine';

export function toWorkoutPlan(w: Workout): WorkoutPlan {
  return {
    rounds: w.rounds,
    restBetweenExercises: w.restBetweenExercises,
    restBetweenRounds: w.restBetweenRounds,
    items: w.items.map((i) => ({
      name: i.exerciseName,
      description: i.exerciseDescription,
      image: imageUrl(i.exerciseImage),
      type: i.type,
      value: i.value,
      sets: i.sets,
    })),
  };
}

export function toStretchingPlan(s: Stretching): StretchingPlan {
  return { items: s.items.map((i) => ({ name: i.name, image: imageUrl(i.image), durationSec: i.durationSec })) };
}
