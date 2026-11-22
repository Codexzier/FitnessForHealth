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
  // 2: Profil/Theme, Teilen, eigene Aktivitäten, Trainingspläne
  `
  ALTER TABLE users ADD COLUMN avatar TEXT;
  ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'standard';
  ALTER TABLE users ADD COLUMN color_mode TEXT NOT NULL DEFAULT 'system';

  ALTER TABLE workouts ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE stretchings ADD COLUMN shared INTEGER NOT NULL DEFAULT 0;

  -- Verlauf: neuer Typ „activity“ (Laufen & eigene Aktivitäten) und Strecke
  CREATE TABLE executions_new (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('workout', 'stretching', 'activity')),
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    distance_km REAL,
    rating TEXT CHECK (rating IN ('bad', 'medium', 'good')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'aborted'))
  );
  INSERT INTO executions_new (id, user_id, kind, name, started_at, duration_sec, rating, status)
    SELECT id, user_id, kind, name, started_at, duration_sec, rating, status FROM executions;
  DROP TABLE executions;
  ALTER TABLE executions_new RENAME TO executions;
  CREATE INDEX idx_executions_user_started ON executions(user_id, started_at);

  CREATE TABLE activity_types (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏃'
  );
  CREATE INDEX idx_activity_types_user ON activity_types(user_id);
  INSERT INTO activity_types (user_id, name, icon) SELECT id, 'Laufen', '🏃' FROM users;

  CREATE TABLE training_plans (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weeks INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_training_plans_user ON training_plans(user_id);

  -- week = 0: Wochenmuster, week >= 1: Abweichung für genau diese Woche
  CREATE TABLE plan_entries (
    id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    week INTEGER NOT NULL DEFAULT 0,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    position INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('workout', 'stretching', 'activity')),
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL,
    stretching_id INTEGER REFERENCES stretchings(id) ON DELETE SET NULL,
    activity_type_id INTEGER REFERENCES activity_types(id) ON DELETE RESTRICT,
    target_type TEXT CHECK (target_type IN ('duration', 'distance')),
    target_value REAL
  );
  CREATE INDEX idx_plan_entries_plan ON plan_entries(plan_id);

  -- Tage einzelner Wochen, die vom Muster abweichen (auch leer = Ruhetag)
  CREATE TABLE plan_overrides (
    plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    PRIMARY KEY (plan_id, week, weekday)
  );

  CREATE TABLE plan_completions (
    id INTEGER PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    entry_id INTEGER NOT NULL REFERENCES plan_entries(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    execution_id INTEGER REFERENCES executions(id) ON DELETE SET NULL,
    UNIQUE (entry_id, date)
  );
  CREATE INDEX idx_plan_completions_plan ON plan_completions(plan_id);
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

/** Führt alle offenen Migrationen aus (oder nur bis `upTo`, für Tests). */
export function migrate(db: DB, upTo = migrations.length): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < upTo; i++) {
    db.transaction(() => {
      db.exec(migrations[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}
