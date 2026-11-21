export interface User {
  id: number;
  name: string;
}

export interface Exercise {
  id: number;
  name: string;
  description: string;
  image: string | null;
}

export interface StretchExercise {
  id: number;
  name: string;
  durationSec: number;
  image: string | null;
}

export type ItemType = 'time' | 'reps';

export interface WorkoutItem {
  id?: number;
  exerciseId: number;
  type: ItemType;
  value: number;
  sets: number;
  exerciseName: string;
  exerciseDescription: string;
  exerciseImage: string | null;
}

export interface Workout {
  id: number;
  name: string;
  rounds: number;
  restBetweenExercises: number;
  restBetweenRounds: number;
  items: WorkoutItem[];
}

export interface StretchingItem {
  id?: number;
  stretchExerciseId: number;
  name: string;
  durationSec: number;
  image: string | null;
}

export interface Stretching {
  id: number;
  name: string;
  items: StretchingItem[];
}

export type Rating = 'bad' | 'medium' | 'good';
export type Kind = 'workout' | 'stretching';

export interface Execution {
  id: number;
  kind: Kind;
  name: string;
  startedAt: string;
  durationSec: number;
  rating: Rating | null;
  status: 'completed' | 'aborted';
}
