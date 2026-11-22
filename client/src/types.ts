export type ThemeName = 'standard' | 'ozean' | 'sonnenuntergang' | 'lavendel' | 'kirsche';
export type ColorMode = 'system' | 'light' | 'dark';

/** Eintrag der Benutzerauswahl */
export interface User {
  id: number;
  name: string;
  avatar: string | null;
}

/** Angemeldeter Benutzer */
export interface Profile extends User {
  theme: ThemeName;
  colorMode: ColorMode;
  /** nur ESP32-Variante: true, wenn ein Passwort gesetzt ist (dann gibt es „Abmelden“) */
  passwordRequired?: boolean;
}

interface Owned {
  shared: boolean;
  ownerId: number;
  ownerName: string;
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

export interface Workout extends Owned {
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

export interface Stretching extends Owned {
  id: number;
  name: string;
  items: StretchingItem[];
}

export type Rating = 'bad' | 'medium' | 'good';
export type Kind = 'workout' | 'stretching';
export type ExecutionKind = Kind | 'activity';

export interface Execution {
  id: number;
  kind: ExecutionKind;
  name: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number | null;
  rating: Rating | null;
  status: 'completed' | 'aborted';
}

// ---------- Trainingsplan ----------

export interface ActivityType {
  id: number;
  name: string;
  icon: string;
}

export type EntryKind = 'workout' | 'stretching' | 'activity';
export type TargetType = 'duration' | 'distance';

export interface PlanEntry {
  id?: number;
  /** 0 = Wochenmuster, >= 1 = Abweichung für diese Woche */
  week: number;
  /** 1 = Montag … 7 = Sonntag */
  weekday: number;
  kind: EntryKind;
  workoutId: number | null;
  stretchingId: number | null;
  activityTypeId: number | null;
  targetType: TargetType | null;
  targetValue: number | null;
  workoutName?: string | null;
  stretchingName?: string | null;
  activityName?: string | null;
  activityIcon?: string | null;
}

export interface PlanSummary {
  id: number;
  name: string;
  weeks: number;
  startDate: string;
  active: boolean;
}

export interface Plan extends PlanSummary {
  entries: PlanEntry[];
  overrides: { week: number; weekday: number }[];
  completions: { entryId: number; date: string; executionId: number | null }[];
}
