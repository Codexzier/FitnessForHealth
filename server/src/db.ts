import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

/**
 * Migrationen werden in Reihenfolge ausgeführt. Der Stand wird in
 * `PRAGMA user_version` gespeichert. Neue Migrationen nur anhängen,
 * bestehende niemals ändern.
 */
const migrations: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE exercises (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT
  );
  CREATE INDEX idx_exercises_user ON exercises(user_id);

  CREATE TABLE stretch_exercises (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    image TEXT
  );
  CREATE INDEX idx_stretch_exercises_user ON stretch_exercises(user_id);

  CREATE TABLE workouts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rounds INTEGER NOT NULL DEFAULT 1,
    rest_exercise_sec INTEGER NOT NULL DEFAULT 0,
    rest_round_sec INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_workouts_user ON workouts(user_id);

  CREATE TABLE workout_items (
    id INTEGER PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('time', 'reps')),
    value INTEGER NOT NULL,
    sets INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_workout_items_workout ON workout_items(workout_id);

  CREATE TABLE stretchings (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );
  CREATE INDEX idx_stretchings_user ON stretchings(user_id);

  CREATE TABLE stretching_items (
    id INTEGER PRIMARY KEY,
    stretching_id INTEGER NOT NULL REFERENCES stretchings(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    stretch_exercise_id INTEGER NOT NULL REFERENCES stretch_exercises(id) ON DELETE RESTRICT
  );
  CREATE INDEX idx_stretching_items_stretching ON stretching_items(stretching_id);

  CREATE TABLE executions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('workout', 'stretching')),
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    rating TEXT CHECK (rating IN ('bad', 'medium', 'good')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'aborted'))
  );
  CREATE INDEX idx_executions_user_started ON executions(user_id, started_at);
  `,
];

export function openDb(dataDir: string, fileName = 'fitness.db'): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(fileName === ':memory:' ? ':memory:' : path.join(dataDir, fileName));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}
