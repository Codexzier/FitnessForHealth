import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

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
  const cookie = String(res.headers['set-cookie']).split(';')[0];
  return { id: res.json().id as number, cookie };
}

async function pngDataUrl() {
  const buf = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#3388ff' } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

describe('API', () => {
  it('legt Benutzer an, prüft Passwort und schützt Daten', async () => {
    const { id } = await createUser('Anna');
    expect((await app.inject({ url: '/api/workouts' })).statusCode).toBe(401);
    const wrong = await app.inject({ method: 'POST', url: '/api/login', payload: { userId: id, password: 'falsch' } });
    expect(wrong.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/api/login', payload: { userId: id, password: 'geheim' } });
    expect(ok.statusCode).toBe(200);
    const dup = await app.inject({ method: 'POST', url: '/api/users', payload: { name: 'anna', password: 'xxxx' } });
    expect(dup.statusCode).toBe(409);
  });

  it('trennt Daten zwischen Benutzern und verkleinert Bilder', async () => {
    const a = await createUser('A');
    const b = await createUser('B');
    const ex = await app.inject({
      method: 'POST',
      url: '/api/exercises',
      headers: { cookie: a.cookie },
      payload: { name: 'Liegestütz', description: 'Brust', imageData: await pngDataUrl() },
    });
    expect(ex.statusCode).toBe(200);
    const image = ex.json().image as string;
    const meta = await sharp(path.join(dir, 'images', image)).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(800);

    const listB = await app.inject({ url: '/api/exercises', headers: { cookie: b.cookie } });
    expect(listB.json()).toEqual([]);
    const wB = await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: { cookie: b.cookie },
      payload: {
        name: 'X',
        rounds: 1,
        restBetweenExercises: 0,
        restBetweenRounds: 0,
        items: [{ exerciseId: ex.json().id, type: 'reps', value: 10, sets: 1 }],
      },
    });
    expect(wB.statusCode).toBe(400);
  });

  it('exportiert und importiert Workouts mit Überschreiben und Kopie', async () => {
    const a = await createUser('A');
    const h = { cookie: a.cookie };
    const ex = (
      await app.inject({
        method: 'POST',
        url: '/api/exercises',
        headers: h,
        payload: { name: 'Kniebeuge', imageData: await pngDataUrl() },
      })
    ).json();
    const se = (
      await app.inject({ method: 'POST', url: '/api/stretch-exercises', headers: h, payload: { name: 'Wade', durationSec: 30 } })
    ).json();
    await app.inject({
      method: 'POST',
      url: '/api/workouts',
      headers: h,
      payload: {
        name: 'Beine',
        rounds: 3,
        restBetweenExercises: 10,
        restBetweenRounds: 60,
        items: [{ exerciseId: ex.id, type: 'time', value: 40, sets: 2 }],
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/stretchings',
      headers: h,
      payload: { name: 'Abends', items: [{ stretchExerciseId: se.id }] },
    });

    const exported = (await app.inject({ url: '/api/export/plans', headers: h })).json();
    expect(exported.version).toBe(1);
    expect(exported.exercises[0].image).toMatch(/^data:image\/webp;base64,/);

    const preview = (
      await app.inject({ method: 'POST', url: '/api/import/plans/preview', headers: h, payload: { data: exported } })
    ).json();
    expect(preview.workouts[0]).toMatchObject({ name: 'Beine', conflict: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/import/plans',
      headers: h,
      payload: {
        data: exported,
        decisions: { exercises: { Kniebeuge: 'overwrite' }, workouts: { Beine: 'copy' }, stretchings: { Abends: 'overwrite' } },
      },
    });
    expect(res.statusCode).toBe(200);
    const workouts = (await app.inject({ url: '/api/workouts', headers: h })).json();
    expect(workouts.map((w: { name: string }) => w.name)).toEqual(['Beine', 'Beine (Kopie)']);
    const exercises = (await app.inject({ url: '/api/exercises', headers: h })).json();
    expect(exercises).toHaveLength(1);
    const stretchExercises = (await app.inject({ url: '/api/stretch-exercises', headers: h })).json();
    expect(stretchExercises.map((s: { name: string }) => s.name)).toEqual(['Wade', 'Wade (Kopie)']);
    const stretchings = (await app.inject({ url: '/api/stretchings', headers: h })).json();
    expect(stretchings).toHaveLength(1);
    // Bilddateien: nur die aktuell referenzierte (altes Bild wurde ersetzt)
    expect(fs.readdirSync(path.join(dir, 'images'))).toHaveLength(1);
  });

  it('überspringt vorhandene Fortschritts-Einträge beim Import', async () => {
    const a = await createUser('A');
    const h = { cookie: a.cookie };
    const exec = {
      kind: 'workout',
      name: 'Beine',
      startedAt: '2026-11-20T18:00:00.000Z',
      durationSec: 1200,
      rating: 'good',
      status: 'completed',
    };
    await app.inject({ method: 'POST', url: '/api/executions', headers: h, payload: exec });
    const file = {
      format: 'fitnessforhealth-progress',
      version: 1,
      executions: [exec, { ...exec, startedAt: '2026-11-21T18:00:00.000Z', rating: null, status: 'aborted' }],
    };
    const preview = (
      await app.inject({ method: 'POST', url: '/api/import/progress/preview', headers: h, payload: { data: file } })
    ).json();
    expect(preview).toEqual({ total: 2, duplicates: 1, new: 1 });
    const res = (await app.inject({ method: 'POST', url: '/api/import/progress', headers: h, payload: { data: file } })).json();
    expect(res).toEqual({ imported: 1, skipped: 1 });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/import/progress',
      headers: h,
      payload: { data: { format: 'x', version: 1, executions: [] } },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain('kein Fortschritts-Export');
  });
});
