import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { migrate } from './db';
import { weekOf, weekdayOf } from './planRepo';

let app: FastifyInstance;
let dir: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffh-'));
  ({ app } = await buildApp({ dataDir: dir }));
});

afterEach(async () => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createUser(name: string, password = 'geheim') {
  const res = await app.inject({ method: 'POST', url: '/api/users', payload: { name, password } });
  expect(res.statusCode).toBe(200);
  return { id: res.json().id as number, cookie: String(res.headers['set-cookie']).split(';')[0] };
}

const call = (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

async function makeWorkout(cookie: string, name: string, shared = false) {
  const ex = (await call(cookie, 'POST', '/api/exercises', { name: `Übung ${name}` })).json();
  return (
    await call(cookie, 'POST', '/api/workouts', {
      name,
      shared,
      rounds: 1,
      restBetweenExercises: 0,
      restBetweenRounds: 0,
      items: [{ exerciseId: ex.id, type: 'reps', value: 10, sets: 2 }],
    })
  ).json();
}

describe('Teilen', () => {
  it('zeigt freigegebene Workouts anderen Benutzern, erlaubt aber nur dem Besitzer das Bearbeiten', async () => {
    const a = await createUser('Anna');
    const b = await createUser('Ben');
    const shared = await makeWorkout(a.cookie, 'Für alle', true);
    await makeWorkout(a.cookie, 'Privat');

    const listB = (await call(b.cookie, 'GET', '/api/workouts')).json();
    expect(listB.map((w: { name: string }) => w.name)).toEqual(['Für alle']);
    expect(listB[0]).toMatchObject({ ownerName: 'Anna', shared: true });

    const put = await call(b.cookie, 'PUT', `/api/workouts/${shared.id}`, {
      name: 'Übernommen',
      rounds: 1,
      restBetweenExercises: 0,
      restBetweenRounds: 0,
      items: [],
    });
    expect(put.statusCode).toBe(404);
    expect((await call(b.cookie, 'DELETE', `/api/workouts/${shared.id}`)).statusCode).toBe(404);

    const copy = await call(b.cookie, 'POST', `/api/workouts/${shared.id}/copy`);
    expect(copy.statusCode).toBe(200);
    expect(copy.json()).toMatchObject({ name: 'Für alle', ownerName: 'Ben', shared: false });
    expect((await call(b.cookie, 'GET', '/api/exercises')).json()).toHaveLength(1);
  });
});

describe('Einstellungen', () => {
  it('ändert Name, Theme und Passwort', async () => {
    const a = await createUser('Anna');
    await createUser('Ben');
    expect((await call(a.cookie, 'PUT', '/api/me', { name: 'ben' })).statusCode).toBe(409);
    const me = (await call(a.cookie, 'PUT', '/api/me', { name: 'Annika', theme: 'ozean', colorMode: 'dark' })).json();
    expect(me).toMatchObject({ name: 'Annika', theme: 'ozean', colorMode: 'dark', avatar: null });

    const wrong = await call(a.cookie, 'PUT', '/api/me/password', { currentPassword: 'x', newPassword: 'neu12345' });
    expect(wrong.statusCode).toBe(400);
    const ok = await call(a.cookie, 'PUT', '/api/me/password', { currentPassword: 'geheim', newPassword: 'neu12345' });
    expect(ok.statusCode).toBe(200);
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { userId: a.id, password: 'neu12345' } });
    expect(login.statusCode).toBe(200);
  });

  it('liefert Profilbilder öffentlich für die Benutzerauswahl', async () => {
    const a = await createUser('Anna');
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const me = (await call(a.cookie, 'PUT', '/api/me/avatar', { imageData: png })).json();
    expect(me.avatar).toMatch(/\.webp$/);
    const users = (await app.inject({ url: '/api/users' })).json();
    expect(users[0].avatar).toBe(me.avatar);
    expect((await app.inject({ url: `/api/avatars/${me.avatar}` })).statusCode).toBe(200);
  });
});

describe('Trainingsplan', () => {
  it('rechnet Wochen und Wochentage', () => {
    expect(weekdayOf('2026-11-23')).toBe(1); // Montag
    expect(weekdayOf('2026-11-29')).toBe(7);
    expect(weekOf('2026-11-23', '2026-11-29')).toBe(1);
    expect(weekOf('2026-11-23', '2026-11-30')).toBe(2);
  });

  it('speichert Muster und Abweichungen, hakt Laufen und Workouts ab', async () => {
    const a = await createUser('Anna');
    const [run] = (await call(a.cookie, 'GET', '/api/activity-types')).json();
    expect(run.name).toBe('Laufen');
    const w = await makeWorkout(a.cookie, 'Kraft');

    const res = await call(a.cookie, 'POST', '/api/plans', {
      name: '4 Wochen fit',
      weeks: 4,
      startDate: '2026-11-23',
      active: true,
      entries: [
        { week: 0, weekday: 1, kind: 'activity', activityTypeId: run.id, targetType: 'duration', targetValue: 30 },
        { week: 0, weekday: 3, kind: 'workout', workoutId: w.id },
        // Woche 2: Mittwoch stattdessen Laufen
        { week: 2, weekday: 3, kind: 'activity', activityTypeId: run.id, targetType: 'distance', targetValue: 5 },
        // ohne Abweichung → wird verworfen
        { week: 3, weekday: 5, kind: 'workout', workoutId: w.id },
      ],
      overrides: [{ week: 2, weekday: 3 }],
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    expect(plan.entries).toHaveLength(3);
    const runEntry = plan.entries.find((e: { weekday: number; week: number }) => e.weekday === 1);
    const workoutEntry = plan.entries.find((e: { kind: string }) => e.kind === 'workout');

    // Laufen am Montag der 1. Woche bestätigen
    const done = await call(a.cookie, 'POST', `/api/plans/${plan.id}/completions`, {
      entryId: runEntry.id,
      date: '2026-11-23',
      durationMin: 32,
      distanceKm: 5.2,
      rating: 'good',
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().completions).toHaveLength(1);

    // falscher Tag
    const wrongDay = await call(a.cookie, 'POST', `/api/plans/${plan.id}/completions`, {
      entryId: runEntry.id,
      date: '2026-11-24',
      rating: null,
    });
    expect(wrongDay.statusCode).toBe(400);

    // Workout am Mittwoch der 2. Woche steht nicht im Plan (Abweichung), in Woche 1 schon
    const exec = {
      kind: 'workout',
      name: 'Kraft',
      startedAt: '2026-11-25T17:00:00.000Z',
      durationSec: 600,
      rating: 'medium',
      status: 'completed',
    };
    const bad = await call(a.cookie, 'POST', '/api/executions', {
      ...exec,
      plan: { planId: plan.id, entryId: workoutEntry.id, date: '2026-12-02' },
    });
    expect(bad.statusCode).toBe(400);
    const good = await call(a.cookie, 'POST', '/api/executions', {
      ...exec,
      plan: { planId: plan.id, entryId: workoutEntry.id, date: '2026-11-25' },
    });
    expect(good.statusCode).toBe(200);

    const after = (await call(a.cookie, 'GET', `/api/plans/${plan.id}`)).json();
    expect(after.completions).toHaveLength(2);
    const history = (await call(a.cookie, 'GET', '/api/executions')).json();
    expect(history.find((h: { kind: string }) => h.kind === 'activity')).toMatchObject({
      name: 'Laufen',
      durationSec: 1920,
      distanceKm: 5.2,
    });

    // Bearbeiten behält Einträge mit id samt Haken
    const resaved = (
      await call(a.cookie, 'PUT', `/api/plans/${plan.id}`, {
        name: '4 Wochen fit',
        weeks: 4,
        startDate: '2026-11-23',
        active: true,
        entries: after.entries,
        overrides: after.overrides,
      })
    ).json();
    expect(resaved.completions).toHaveLength(2);

    // Aktivität in Verwendung kann nicht gelöscht werden
    expect((await call(a.cookie, 'DELETE', `/api/activity-types/${run.id}`)).statusCode).toBe(409);

    // Rückgängig
    const undone = (
      await call(a.cookie, 'DELETE', `/api/plans/${plan.id}/completions/${runEntry.id}/2026-11-23`)
    ).json();
    expect(undone.completions).toHaveLength(1);
  });

  it('erlaubt nur einen aktiven Plan', async () => {
    const a = await createUser('Anna');
    const base = { weeks: 2, startDate: '2026-11-23', active: true, entries: [], overrides: [] };
    await call(a.cookie, 'POST', '/api/plans', { ...base, name: 'Eins' });
    await call(a.cookie, 'POST', '/api/plans', { ...base, name: 'Zwei' });
    const list = (await call(a.cookie, 'GET', '/api/plans')).json();
    expect(list.filter((p: { active: boolean }) => p.active).map((p: { name: string }) => p.name)).toEqual(['Zwei']);
  });
});

describe('Migration', () => {
  it('hebt eine Datenbank von Version 1 an und behält die Daten', async () => {
    await app.close();
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ffh-v1-'));
    // Version-1-Datenbank nachbauen
    const db = new Database(path.join(dir2, 'fitness.db'));
    migrate(db, 1);
    db.prepare("INSERT INTO users (id, name, password_hash) VALUES (1, 'Alt', 'x')").run();
    db.prepare(
      `INSERT INTO executions (user_id, kind, name, started_at, duration_sec, rating, status)
       VALUES (1, 'workout', 'Alt-Workout', '2026-01-01T10:00:00Z', 900, 'good', 'completed')`,
    ).run();
    db.close();

    ({ app } = await buildApp({ dataDir: dir2 }));
    const users = (await app.inject({ url: '/api/users' })).json();
    expect(users).toEqual([{ id: 1, name: 'Alt', avatar: null }]);
    const check = new Database(path.join(dir2, 'fitness.db'));
    expect(check.pragma('user_version', { simple: true })).toBe(2);
    expect(check.prepare('SELECT name FROM activity_types WHERE user_id = 1').all()).toEqual([{ name: 'Laufen' }]);
    expect(check.prepare('SELECT name, rating FROM executions').all()).toEqual([{ name: 'Alt-Workout', rating: 'good' }]);
    check.close();
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
