import type { DB } from './db';
import { badRequest, conflict, notFound } from './errors';

export type EntryKind = 'workout' | 'stretching' | 'activity';
export type TargetType = 'duration' | 'distance';

export interface ActivityType {
  id: number;
  name: string;
  icon: string;
}

export interface PlanEntryInput {
  id?: number;
  /** 0 = Wochenmuster, >= 1 = Abweichung für diese Woche */
  week: number;
  /** 1 = Montag … 7 = Sonntag */
  weekday: number;
  kind: EntryKind;
  workoutId: number | null;
  stretchingId: number | null;
  activityTypeId: number | null;
  /** Ziel für Aktivitäten: Dauer in Minuten oder Strecke in km */
  targetType: TargetType | null;
  targetValue: number | null;
}

export interface PlanInput {
  name: string;
  weeks: number;
  startDate: string;
  active: boolean;
  entries: PlanEntryInput[];
  overrides: { week: number; weekday: number }[];
}

export interface PlanEntry extends PlanEntryInput {
  id: number;
  position: number;
  workoutName: string | null;
  stretchingName: string | null;
  activityName: string | null;
  activityIcon: string | null;
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

// ---------- Datumslogik (identisch zu client/src/plan/schedule.ts) ----------

const DAY_MS = 24 * 3600 * 1000;

export function parseDate(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw badRequest('Ungültiges Datum.');
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 1 = Montag … 7 = Sonntag */
export const weekdayOf = (date: string) => ((new Date(parseDate(date)).getUTCDay() + 6) % 7) + 1;

/** Woche im Plan (1-basiert); 0 oder > weeks = außerhalb */
export const weekOf = (startDate: string, date: string) =>
  Math.floor((parseDate(date) - parseDate(startDate)) / DAY_MS / 7) + 1;

export class PlanRepo {
  constructor(private db: DB) {}

  // ---------- Eigene Aktivitäten ----------

  listActivityTypes(userId: number): ActivityType[] {
    return this.db
      .prepare('SELECT id, name, icon FROM activity_types WHERE user_id = ? ORDER BY id')
      .all(userId) as ActivityType[];
  }

  createDefaultActivities(userId: number): void {
    this.db.prepare("INSERT INTO activity_types (user_id, name, icon) VALUES (?, 'Laufen', '🏃')").run(userId);
  }

  private ensureUniqueActivity(userId: number, name: string, exceptId?: number) {
    const row = this.db
      .prepare('SELECT id FROM activity_types WHERE user_id = ? AND name = ? COLLATE NOCASE')
      .get(userId, name) as { id: number } | undefined;
    if (row && row.id !== exceptId) throw conflict('Diese Aktivität gibt es bereits.');
  }

  createActivityType(userId: number, a: Omit<ActivityType, 'id'>): ActivityType {
    this.ensureUniqueActivity(userId, a.name);
    const r = this.db
      .prepare('INSERT INTO activity_types (user_id, name, icon) VALUES (?, ?, ?)')
      .run(userId, a.name, a.icon);
    return { id: Number(r.lastInsertRowid), ...a };
  }

  updateActivityType(userId: number, id: number, a: Omit<ActivityType, 'id'>): ActivityType {
    this.ensureUniqueActivity(userId, a.name, id);
    const r = this.db
      .prepare('UPDATE activity_types SET name = ?, icon = ? WHERE user_id = ? AND id = ?')
      .run(a.name, a.icon, userId, id);
    if (r.changes === 0) throw notFound('Aktivität nicht gefunden.');
    return { id, ...a };
  }

  deleteActivityType(userId: number, id: number): void {
    const used = this.db
      .prepare(
        `SELECT DISTINCT p.name FROM plan_entries e JOIN training_plans p ON p.id = e.plan_id
         WHERE e.activity_type_id = ? ORDER BY p.name`,
      )
      .all(id) as { name: string }[];
    if (used.length) {
      throw conflict(`Die Aktivität wird noch in folgenden Trainingsplänen verwendet: ${used.map((u) => u.name).join(', ')}`);
    }
    const r = this.db.prepare('DELETE FROM activity_types WHERE user_id = ? AND id = ?').run(userId, id);
    if (r.changes === 0) throw notFound('Aktivität nicht gefunden.');
  }

  // ---------- Trainingspläne ----------

  listPlans(userId: number): PlanSummary[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, weeks, start_date AS startDate, active FROM training_plans
         WHERE user_id = ? ORDER BY active DESC, start_date DESC, name COLLATE NOCASE`,
      )
      .all(userId) as (Omit<PlanSummary, 'active'> & { active: number })[];
    return rows.map((p) => ({ ...p, active: !!p.active }));
  }

  getPlan(userId: number, id: number): Plan {
    const p = this.db
      .prepare('SELECT id, name, weeks, start_date AS startDate, active FROM training_plans WHERE user_id = ? AND id = ?')
      .get(userId, id) as (Omit<PlanSummary, 'active'> & { active: number }) | undefined;
    if (!p) throw notFound('Trainingsplan nicht gefunden.');
    const entries = this.db
      .prepare(
        `SELECT e.id, e.week, e.weekday, e.position, e.kind,
                e.workout_id AS workoutId, w.name AS workoutName,
                e.stretching_id AS stretchingId, s.name AS stretchingName,
                e.activity_type_id AS activityTypeId, a.name AS activityName, a.icon AS activityIcon,
                e.target_type AS targetType, e.target_value AS targetValue
         FROM plan_entries e
         LEFT JOIN workouts w ON w.id = e.workout_id
         LEFT JOIN stretchings s ON s.id = e.stretching_id
         LEFT JOIN activity_types a ON a.id = e.activity_type_id
         WHERE e.plan_id = ? ORDER BY e.week, e.weekday, e.position`,
      )
      .all(id) as PlanEntry[];
    const overrides = this.db
      .prepare('SELECT week, weekday FROM plan_overrides WHERE plan_id = ? ORDER BY week, weekday')
      .all(id) as { week: number; weekday: number }[];
    const completions = this.db
      .prepare('SELECT entry_id AS entryId, date, execution_id AS executionId FROM plan_completions WHERE plan_id = ?')
      .all(id) as Plan['completions'];
    return { ...p, active: !!p.active, entries, overrides, completions };
  }

  private validateEntry(userId: number, e: PlanEntryInput) {
    const visible = (table: 'workouts' | 'stretchings', refId: number) =>
      !!this.db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND (user_id = ? OR shared = 1)`).get(refId, userId);
    if (e.kind === 'workout' && e.workoutId !== null && !visible('workouts', e.workoutId)) {
      throw badRequest('Ein ausgewähltes Workout existiert nicht.');
    }
    if (e.kind === 'stretching' && e.stretchingId !== null && !visible('stretchings', e.stretchingId)) {
      throw badRequest('Ein ausgewähltes Stretching existiert nicht.');
    }
    if (e.kind === 'activity') {
      if (e.activityTypeId === null) throw badRequest('Bitte eine Aktivität auswählen.');
      const own = this.db.prepare('SELECT 1 FROM activity_types WHERE id = ? AND user_id = ?').get(e.activityTypeId, userId);
      if (!own) throw badRequest('Eine ausgewählte Aktivität existiert nicht.');
    }
  }

  /** Legt einen Plan an (id = null) oder ersetzt ihn. Einträge mit id bleiben erhalten, samt Erledigt-Haken. */
  savePlan(userId: number, id: number | null, input: PlanInput): number {
    parseDate(input.startDate);
    return this.db.transaction(() => {
      let planId: number;
      if (id === null) {
        const r = this.db
          .prepare('INSERT INTO training_plans (user_id, name, weeks, start_date, active) VALUES (?, ?, ?, ?, ?)')
          .run(userId, input.name, input.weeks, input.startDate, input.active ? 1 : 0);
        planId = Number(r.lastInsertRowid);
      } else {
        const r = this.db
          .prepare('UPDATE training_plans SET name = ?, weeks = ?, start_date = ?, active = ? WHERE user_id = ? AND id = ?')
          .run(input.name, input.weeks, input.startDate, input.active ? 1 : 0, userId, id);
        if (r.changes === 0) throw notFound('Trainingsplan nicht gefunden.');
        planId = id;
      }
      if (input.active) {
        this.db.prepare('UPDATE training_plans SET active = 0 WHERE user_id = ? AND id != ?').run(userId, planId);
      }

      // Abweichungen nur innerhalb der Laufzeit; Einträge einer Woche nur, wenn der Tag abweicht
      const overrides = new Map<string, { week: number; weekday: number }>();
      for (const o of input.overrides) {
        if (o.week >= 1 && o.week <= input.weeks) overrides.set(`${o.week}-${o.weekday}`, o);
      }
      const entries = input.entries.filter((e) => e.week === 0 || overrides.has(`${e.week}-${e.weekday}`));
      entries.forEach((e) => this.validateEntry(userId, e));

      this.db.prepare('DELETE FROM plan_overrides WHERE plan_id = ?').run(planId);
      const insOverride = this.db.prepare('INSERT INTO plan_overrides (plan_id, week, weekday) VALUES (?, ?, ?)');
      overrides.forEach((o) => insOverride.run(planId, o.week, o.weekday));

      const existing = new Set(
        (this.db.prepare('SELECT id FROM plan_entries WHERE plan_id = ?').all(planId) as { id: number }[]).map((r) => r.id),
      );
      const keep = new Set<number>();
      const positions = new Map<string, number>();
      const update = this.db.prepare(
        `UPDATE plan_entries SET week = ?, weekday = ?, position = ?, kind = ?, workout_id = ?, stretching_id = ?,
         activity_type_id = ?, target_type = ?, target_value = ? WHERE id = ? AND plan_id = ?`,
      );
      const insert = this.db.prepare(
        `INSERT INTO plan_entries (plan_id, week, weekday, position, kind, workout_id, stretching_id,
         activity_type_id, target_type, target_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of entries) {
        const slot = `${e.week}-${e.weekday}`;
        const pos = positions.get(slot) ?? 0;
        positions.set(slot, pos + 1);
        const values = [
          e.week,
          e.weekday,
          pos,
          e.kind,
          e.kind === 'workout' ? e.workoutId : null,
          e.kind === 'stretching' ? e.stretchingId : null,
          e.kind === 'activity' ? e.activityTypeId : null,
          e.kind === 'activity' ? e.targetType : null,
          e.kind === 'activity' && e.targetType ? e.targetValue : null,
        ];
        if (e.id !== undefined && existing.has(e.id) && !keep.has(e.id)) {
          update.run(...values, e.id, planId);
          keep.add(e.id);
        } else {
          insert.run(planId, ...values);
        }
      }
      const del = this.db.prepare('DELETE FROM plan_entries WHERE id = ?');
      existing.forEach((eid) => !keep.has(eid) && del.run(eid));
      return planId;
    })();
  }

  deletePlan(userId: number, id: number): void {
    const r = this.db.prepare('DELETE FROM training_plans WHERE user_id = ? AND id = ?').run(userId, id);
    if (r.changes === 0) throw notFound('Trainingsplan nicht gefunden.');
  }

  /** Prüft, ob ein Eintrag am angegebenen Tag im Plan steht, und liefert ihn zurück. */
  entryForDate(userId: number, planId: number, entryId: number, date: string): PlanEntry {
    const plan = this.getPlan(userId, planId);
    const entry = plan.entries.find((e) => e.id === entryId);
    if (!entry) throw notFound('Eintrag nicht gefunden.');
    const week = weekOf(plan.startDate, date);
    if (week < 1 || week > plan.weeks) throw badRequest('Das Datum liegt außerhalb des Trainingsplans.');
    const weekday = weekdayOf(date);
    const overridden = plan.overrides.some((o) => o.week === week && o.weekday === weekday);
    const applies = entry.weekday === weekday && entry.week === (overridden ? week : 0);
    if (!applies) throw badRequest('Dieser Eintrag steht an diesem Tag nicht im Plan.');
    return entry;
  }

  addCompletion(planId: number, entryId: number, date: string, executionId: number | null): void {
    this.db
      .prepare(
        `INSERT INTO plan_completions (plan_id, entry_id, date, execution_id) VALUES (?, ?, ?, ?)
         ON CONFLICT (entry_id, date) DO UPDATE SET execution_id = excluded.execution_id`,
      )
      .run(planId, entryId, date, executionId);
  }

  removeCompletion(userId: number, planId: number, entryId: number, date: string): void {
    this.getPlan(userId, planId); // Besitz prüfen
    this.db.prepare('DELETE FROM plan_completions WHERE plan_id = ? AND entry_id = ? AND date = ?').run(planId, entryId, date);
  }
}
