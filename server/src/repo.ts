import type { DB } from './db';
import { badRequest, conflict, notFound } from './errors';

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

export interface WorkoutItemInput {
  exerciseId: number;
  type: ItemType;
  value: number;
  sets: number;
}

export interface WorkoutInput {
  name: string;
  shared: boolean;
  rounds: number;
  restBetweenExercises: number;
  restBetweenRounds: number;
  items: WorkoutItemInput[];
}

export interface WorkoutItem extends WorkoutItemInput {
  id: number;
  exerciseName: string;
  exerciseDescription: string;
  exerciseImage: string | null;
}

export interface Owner {
  ownerId: number;
  ownerName: string;
}

export interface Workout extends Omit<WorkoutInput, 'items'>, Owner {
  id: number;
  items: WorkoutItem[];
}

export interface StretchingInput {
  name: string;
  shared: boolean;
  items: { stretchExerciseId: number }[];
}

export interface StretchingItem {
  id: number;
  stretchExerciseId: number;
  name: string;
  durationSec: number;
  image: string | null;
}

export interface Stretching extends Owner {
  id: number;
  name: string;
  shared: boolean;
  items: StretchingItem[];
}

export type Rating = 'bad' | 'medium' | 'good';

export interface ExecutionInput {
  kind: 'workout' | 'stretching' | 'activity';
  name: string;
  startedAt: string;
  durationSec: number;
  distanceKm?: number | null;
  rating: Rating | null;
  status: 'completed' | 'aborted';
}

export interface Execution extends ExecutionInput {
  id: number;
}

/** Liefert "Name (Kopie)", "Name (Kopie 2)", ... – je nachdem, was noch frei ist. */
export function uniqueCopyName(name: string, exists: (n: string) => boolean): string {
  let candidate = `${name} (Kopie)`;
  let i = 2;
  while (exists(candidate)) candidate = `${name} (Kopie ${i++})`;
  return candidate;
}

export class Repo {
  constructor(private db: DB) {}

  // ---------- Übungen ----------

  listExercises(userId: number): Exercise[] {
    return this.db
      .prepare('SELECT id, name, description, image FROM exercises WHERE user_id = ? ORDER BY name COLLATE NOCASE')
      .all(userId) as Exercise[];
  }

  getExercise(userId: number, id: number): Exercise {
    const row = this.db
      .prepare('SELECT id, name, description, image FROM exercises WHERE user_id = ? AND id = ?')
      .get(userId, id) as Exercise | undefined;
    if (!row) throw notFound('Übung nicht gefunden.');
    return row;
  }

  findExerciseByName(userId: number, name: string): Exercise | undefined {
    return this.db
      .prepare('SELECT id, name, description, image FROM exercises WHERE user_id = ? AND name = ? COLLATE NOCASE')
      .get(userId, name) as Exercise | undefined;
  }

  insertExercise(userId: number, e: Omit<Exercise, 'id'>): number {
    const r = this.db
      .prepare('INSERT INTO exercises (user_id, name, description, image) VALUES (?, ?, ?, ?)')
      .run(userId, e.name, e.description, e.image);
    return Number(r.lastInsertRowid);
  }

  updateExercise(userId: number, id: number, e: Omit<Exercise, 'id'>): void {
    this.db
      .prepare('UPDATE exercises SET name = ?, description = ?, image = ? WHERE user_id = ? AND id = ?')
      .run(e.name, e.description, e.image, userId, id);
  }

  deleteExercise(userId: number, id: number): Exercise {
    const ex = this.getExercise(userId, id);
    const used = this.db
      .prepare(
        `SELECT DISTINCT w.name FROM workout_items wi JOIN workouts w ON w.id = wi.workout_id
         WHERE wi.exercise_id = ? ORDER BY w.name`,
      )
      .all(id) as { name: string }[];
    if (used.length) {
      throw conflict(`Die Übung wird noch in folgenden Workouts verwendet: ${used.map((u) => u.name).join(', ')}`);
    }
    this.db.prepare('DELETE FROM exercises WHERE user_id = ? AND id = ?').run(userId, id);
    return ex;
  }

  // ---------- Stretching-Übungen ----------

  listStretchExercises(userId: number): StretchExercise[] {
    return this.db
      .prepare(
        `SELECT id, name, duration_sec AS durationSec, image FROM stretch_exercises
         WHERE user_id = ? ORDER BY name COLLATE NOCASE`,
      )
      .all(userId) as StretchExercise[];
  }

  getStretchExercise(userId: number, id: number): StretchExercise {
    const row = this.db
      .prepare('SELECT id, name, duration_sec AS durationSec, image FROM stretch_exercises WHERE user_id = ? AND id = ?')
      .get(userId, id) as StretchExercise | undefined;
    if (!row) throw notFound('Stretching-Übung nicht gefunden.');
    return row;
  }

  findStretchExerciseByName(userId: number, name: string): StretchExercise | undefined {
    return this.db
      .prepare(
        `SELECT id, name, duration_sec AS durationSec, image FROM stretch_exercises
         WHERE user_id = ? AND name = ? COLLATE NOCASE`,
      )
      .get(userId, name) as StretchExercise | undefined;
  }

  insertStretchExercise(userId: number, e: Omit<StretchExercise, 'id'>): number {
    const r = this.db
      .prepare('INSERT INTO stretch_exercises (user_id, name, duration_sec, image) VALUES (?, ?, ?, ?)')
      .run(userId, e.name, e.durationSec, e.image);
    return Number(r.lastInsertRowid);
  }

  updateStretchExercise(userId: number, id: number, e: Omit<StretchExercise, 'id'>): void {
    this.db
      .prepare('UPDATE stretch_exercises SET name = ?, duration_sec = ?, image = ? WHERE user_id = ? AND id = ?')
      .run(e.name, e.durationSec, e.image, userId, id);
  }

  deleteStretchExercise(userId: number, id: number): StretchExercise {
    const ex = this.getStretchExercise(userId, id);
    const used = this.db
      .prepare(
        `SELECT DISTINCT s.name FROM stretching_items si JOIN stretchings s ON s.id = si.stretching_id
         WHERE si.stretch_exercise_id = ? ORDER BY s.name`,
      )
      .all(id) as { name: string }[];
    if (used.length) {
      throw conflict(
        `Die Stretching-Übung wird noch in folgenden Stretchings verwendet: ${used.map((u) => u.name).join(', ')}`,
      );
    }
    this.db.prepare('DELETE FROM stretch_exercises WHERE user_id = ? AND id = ?').run(userId, id);
    return ex;
  }

  // ---------- Workouts ----------

  private workoutItems(workoutId: number): WorkoutItem[] {
    return this.db
      .prepare(
        `SELECT wi.id, wi.exercise_id AS exerciseId, wi.type, wi.value, wi.sets,
                e.name AS exerciseName, e.description AS exerciseDescription, e.image AS exerciseImage
         FROM workout_items wi JOIN exercises e ON e.id = wi.exercise_id
         WHERE wi.workout_id = ? ORDER BY wi.position`,
      )
      .all(workoutId) as WorkoutItem[];
  }

  private static WORKOUT_COLS = `w.id, w.name, w.rounds, w.rest_exercise_sec AS restBetweenExercises,
    w.rest_round_sec AS restBetweenRounds, w.shared, w.user_id AS ownerId, u.name AS ownerName`;

  /** Eigene Workouts und die von anderen Benutzern für alle freigegebenen. */
  listWorkouts(userId: number, onlyOwn = false): Workout[] {
    const rows = this.db
      .prepare(
        `SELECT ${Repo.WORKOUT_COLS} FROM workouts w JOIN users u ON u.id = w.user_id
         WHERE w.user_id = ? ${onlyOwn ? '' : 'OR w.shared = 1'}
         ORDER BY (w.user_id = ?) DESC, w.name COLLATE NOCASE`,
      )
      .all(userId, userId) as (Omit<Workout, 'items' | 'shared'> & { shared: number })[];
    return rows.map((w) => ({ ...w, shared: !!w.shared, items: this.workoutItems(w.id) }));
  }

  /** Liefert ein eigenes oder ein freigegebenes Workout. Mit ownOnly nur eigene (zum Bearbeiten). */
  getWorkout(userId: number, id: number, ownOnly = false): Workout {
    const w = this.db
      .prepare(
        `SELECT ${Repo.WORKOUT_COLS} FROM workouts w JOIN users u ON u.id = w.user_id
         WHERE w.id = ? AND (w.user_id = ? ${ownOnly ? '' : 'OR w.shared = 1'})`,
      )
      .get(id, userId) as (Omit<Workout, 'items' | 'shared'> & { shared: number }) | undefined;
    if (!w) throw notFound('Workout nicht gefunden.');
    return { ...w, shared: !!w.shared, items: this.workoutItems(w.id) };
  }

  findWorkoutIdByName(userId: number, name: string): number | undefined {
    const r = this.db
      .prepare('SELECT id FROM workouts WHERE user_id = ? AND name = ? COLLATE NOCASE')
      .get(userId, name) as { id: number } | undefined;
    return r?.id;
  }

  /** Legt ein Workout an (id = null) oder ersetzt es komplett. Muss synchron in einer Transaktion laufen. */
  saveWorkout(userId: number, id: number | null, input: WorkoutInput): number {
    return this.db.transaction(() => {
      const owned = this.db.prepare('SELECT 1 FROM exercises WHERE user_id = ? AND id = ?');
      for (const item of input.items) {
        if (!owned.get(userId, item.exerciseId)) throw badRequest('Eine ausgewählte Übung existiert nicht.');
      }
      let workoutId: number;
      if (id === null) {
        const r = this.db
          .prepare(
            `INSERT INTO workouts (user_id, name, rounds, rest_exercise_sec, rest_round_sec, shared)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(userId, input.name, input.rounds, input.restBetweenExercises, input.restBetweenRounds, input.shared ? 1 : 0);
        workoutId = Number(r.lastInsertRowid);
      } else {
        const r = this.db
          .prepare(
            `UPDATE workouts SET name = ?, rounds = ?, rest_exercise_sec = ?, rest_round_sec = ?, shared = ?
             WHERE user_id = ? AND id = ?`,
          )
          .run(
            input.name,
            input.rounds,
            input.restBetweenExercises,
            input.restBetweenRounds,
            input.shared ? 1 : 0,
            userId,
            id,
          );
        if (r.changes === 0) throw notFound('Workout nicht gefunden.');
        workoutId = id;
        this.db.prepare('DELETE FROM workout_items WHERE workout_id = ?').run(workoutId);
      }
      const ins = this.db.prepare(
        'INSERT INTO workout_items (workout_id, position, exercise_id, type, value, sets) VALUES (?, ?, ?, ?, ?, ?)',
      );
      input.items.forEach((item, pos) => ins.run(workoutId, pos, item.exerciseId, item.type, item.value, item.sets));
      return workoutId;
    })();
  }

  deleteWorkout(userId: number, id: number): void {
    const r = this.db.prepare('DELETE FROM workouts WHERE user_id = ? AND id = ?').run(userId, id);
    if (r.changes === 0) throw notFound('Workout nicht gefunden.');
  }

  // ---------- Stretchings ----------

  private stretchingItems(stretchingId: number): StretchingItem[] {
    return this.db
      .prepare(
        `SELECT si.id, si.stretch_exercise_id AS stretchExerciseId, se.name, se.duration_sec AS durationSec, se.image
         FROM stretching_items si JOIN stretch_exercises se ON se.id = si.stretch_exercise_id
         WHERE si.stretching_id = ? ORDER BY si.position`,
      )
      .all(stretchingId) as StretchingItem[];
  }

  private static STRETCHING_COLS = 's.id, s.name, s.shared, s.user_id AS ownerId, u.name AS ownerName';

  listStretchings(userId: number, onlyOwn = false): Stretching[] {
    const rows = this.db
      .prepare(
        `SELECT ${Repo.STRETCHING_COLS} FROM stretchings s JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ? ${onlyOwn ? '' : 'OR s.shared = 1'}
         ORDER BY (s.user_id = ?) DESC, s.name COLLATE NOCASE`,
      )
      .all(userId, userId) as (Omit<Stretching, 'items' | 'shared'> & { shared: number })[];
    return rows.map((s) => ({ ...s, shared: !!s.shared, items: this.stretchingItems(s.id) }));
  }

  getStretching(userId: number, id: number, ownOnly = false): Stretching {
    const s = this.db
      .prepare(
        `SELECT ${Repo.STRETCHING_COLS} FROM stretchings s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND (s.user_id = ? ${ownOnly ? '' : 'OR s.shared = 1'})`,
      )
      .get(id, userId) as (Omit<Stretching, 'items' | 'shared'> & { shared: number }) | undefined;
    if (!s) throw notFound('Stretching nicht gefunden.');
    return { ...s, shared: !!s.shared, items: this.stretchingItems(s.id) };
  }

  findStretchingIdByName(userId: number, name: string): number | undefined {
    const r = this.db
      .prepare('SELECT id FROM stretchings WHERE user_id = ? AND name = ? COLLATE NOCASE')
      .get(userId, name) as { id: number } | undefined;
    return r?.id;
  }

  saveStretching(userId: number, id: number | null, input: StretchingInput): number {
    return this.db.transaction(() => {
      const owned = this.db.prepare('SELECT 1 FROM stretch_exercises WHERE user_id = ? AND id = ?');
      for (const item of input.items) {
        if (!owned.get(userId, item.stretchExerciseId)) {
          throw badRequest('Eine ausgewählte Stretching-Übung existiert nicht.');
        }
      }
      let stretchingId: number;
      if (id === null) {
        const r = this.db
          .prepare('INSERT INTO stretchings (user_id, name, shared) VALUES (?, ?, ?)')
          .run(userId, input.name, input.shared ? 1 : 0);
        stretchingId = Number(r.lastInsertRowid);
      } else {
        const r = this.db
          .prepare('UPDATE stretchings SET name = ?, shared = ? WHERE user_id = ? AND id = ?')
          .run(input.name, input.shared ? 1 : 0, userId, id);
        if (r.changes === 0) throw notFound('Stretching nicht gefunden.');
        stretchingId = id;
        this.db.prepare('DELETE FROM stretching_items WHERE stretching_id = ?').run(stretchingId);
      }
      const ins = this.db.prepare(
        'INSERT INTO stretching_items (stretching_id, position, stretch_exercise_id) VALUES (?, ?, ?)',
      );
      input.items.forEach((item, pos) => ins.run(stretchingId, pos, item.stretchExerciseId));
      return stretchingId;
    })();
  }

  deleteStretching(userId: number, id: number): void {
    const r = this.db.prepare('DELETE FROM stretchings WHERE user_id = ? AND id = ?').run(userId, id);
    if (r.changes === 0) throw notFound('Stretching nicht gefunden.');
  }

  // ---------- Verlauf ----------

  listExecutions(userId: number): Execution[] {
    return this.db
      .prepare(
        `SELECT id, kind, name, started_at AS startedAt, duration_sec AS durationSec, distance_km AS distanceKm,
                rating, status
         FROM executions WHERE user_id = ? ORDER BY started_at DESC, id DESC`,
      )
      .all(userId) as Execution[];
  }

  executionExists(userId: number, e: ExecutionInput): boolean {
    return !!this.db
      .prepare('SELECT 1 FROM executions WHERE user_id = ? AND kind = ? AND name = ? AND started_at = ?')
      .get(userId, e.kind, e.name, e.startedAt);
  }

  insertExecution(userId: number, e: ExecutionInput): number {
    const r = this.db
      .prepare(
        `INSERT INTO executions (user_id, kind, name, started_at, duration_sec, distance_km, rating, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        e.kind,
        e.name,
        e.startedAt,
        e.durationSec,
        e.distanceKm ?? null,
        e.status === 'aborted' ? null : e.rating,
        e.status,
      );
    return Number(r.lastInsertRowid);
  }

  deleteExecution(userId: number, id: number): void {
    const r = this.db.prepare('DELETE FROM executions WHERE user_id = ? AND id = ?').run(userId, id);
    if (r.changes === 0) throw notFound('Eintrag nicht gefunden.');
  }

  // ---------- Bilder ----------

  referencedImages(): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT image FROM exercises WHERE image IS NOT NULL
         UNION SELECT image FROM stretch_exercises WHERE image IS NOT NULL
         UNION SELECT avatar FROM users WHERE avatar IS NOT NULL`,
      )
      .all() as { image: string }[];
    return new Set(rows.map((r) => r.image));
  }
}
