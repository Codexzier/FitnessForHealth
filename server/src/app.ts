import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import bcrypt from 'bcryptjs';
import { openDb, type DB } from './db';
import { ImageStore } from './images';
import { Repo, uniqueCopyName } from './repo';
import { PlanRepo } from './planRepo';
import { conflict, notFound, unauthorized, HttpError } from './errors';
import {
  activityTypeSchema,
  avatarSchema,
  completionSchema,
  newExecutionSchema,
  passwordSchema,
  planSchema,
  profileSchema,
  createUserSchema,
  exerciseSchema,
  loginSchema,
  parse,
  plansDecisionsSchema,
  plansFileSchema,
  progressFileSchema,
  stretchExerciseSchema,
  stretchingSchema,
  workoutSchema,
} from './schemas';
import { exportPlans, exportProgress, importPlans, importProgress, previewPlans, previewProgress } from './transfer';

const SESSION_COOKIE = 'ffh_session';
const SESSION_DAYS = 30;

export interface AppOptions {
  dataDir: string;
  staticDir?: string;
  dbFile?: string;
  logger?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

function idParam(req: FastifyRequest): number {
  const id = Number((req.params as { id: string }).id);
  if (!Number.isInteger(id)) throw notFound();
  return id;
}

export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; db: DB }> {
  const db = openDb(opts.dataDir, opts.dbFile);
  const images = new ImageStore(path.join(opts.dataDir, 'images'));
  const repo = new Repo(db);
  const plans = new PlanRepo(db);

  // Verwaiste Bilder (z. B. nach Abstürzen) beim Start aufräumen
  images.cleanup(repo.referencedImages());
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

  const app = Fastify({
    // Standard: nur Warnungen und Fehler. Mit LOG_LEVEL=info werden auch Anfragen protokolliert.
    logger: opts.logger ? { level: process.env.LOG_LEVEL ?? 'warn' } : false,
    bodyLimit: 100 * 1024 * 1024, // Importdateien mit Base64-Bildern können groß sein
  });
  await app.register(cookie);
  app.decorateRequest('userId', 0);

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) req.log.error(err);
    const message =
      status === 413
        ? 'Die Datei ist zu groß.'
        : status >= 500
          ? 'Interner Fehler. Bitte später erneut versuchen.'
          : status === 400 && !(err instanceof HttpError)
            ? 'Ungültige Anfrage.'
            : err.message;
    reply.status(status).send({ error: message });
  });

  // ---------- Sitzungen ----------

  function createSession(reply: FastifyReply, userId: number) {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(expires),
    });
  }

  interface Profile {
    id: number;
    name: string;
    avatar: string | null;
    theme: string;
    colorMode: string;
  }
  const PROFILE_COLS = 'u.id, u.name, u.avatar, u.theme, u.color_mode AS colorMode';

  function sessionUser(req: FastifyRequest): Profile | null {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return null;
    const row = db
      .prepare(
        `SELECT ${PROFILE_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, Date.now()) as Profile | undefined;
    return row ?? null;
  }

  const profile = (id: number) =>
    db.prepare(`SELECT ${PROFILE_COLS} FROM users u WHERE u.id = ?`).get(id) as Profile;

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/users', async () =>
    db.prepare('SELECT id, name, avatar FROM users ORDER BY name COLLATE NOCASE').all(),
  );

  // Profilbilder sind auch ohne Anmeldung sichtbar (Benutzerauswahl)
  app.get('/api/avatars/:name', async (req, reply) => {
    const name = (req.params as { name: string }).name;
    const p = images.path(name);
    const used = db.prepare('SELECT 1 FROM users WHERE avatar = ?').get(name);
    if (!p || !used || !fs.existsSync(p)) throw notFound('Bild nicht gefunden.');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.type('image/webp').send(fs.createReadStream(p));
  });

  app.post('/api/users', async (req, reply) => {
    const body = parse(createUserSchema, req.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE').get(body.name);
    if (exists) throw conflict('Diesen Benutzernamen gibt es bereits.');
    const hash = await bcrypt.hash(body.password, 10);
    const id = db.transaction(() => {
      const r = db.prepare('INSERT INTO users (name, password_hash) VALUES (?, ?)').run(body.name, hash);
      const newId = Number(r.lastInsertRowid);
      plans.createDefaultActivities(newId);
      return newId;
    })();
    createSession(reply, id);
    return profile(id);
  });

  app.post('/api/login', async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const user = db.prepare('SELECT id, name, password_hash FROM users WHERE id = ?').get(body.userId) as
      | { id: number; name: string; password_hash: string }
      | undefined;
    if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw unauthorized('Das Passwort ist falsch.');
    }
    createSession(reply, user.id);
    return profile(user.id);
  });

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req) => {
    const user = sessionUser(req);
    if (!user) throw unauthorized();
    return user;
  });

  // ---------- Geschützte Routen ----------

  await app.register(async (api) => {
    api.addHook('preHandler', async (req) => {
      const user = sessionUser(req);
      if (!user) throw unauthorized();
      req.userId = user.id;
    });

    // Einstellungen
    api.put('/api/me', async (req) => {
      const body = parse(profileSchema, req.body);
      if (body.name !== undefined) {
        const taken = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(body.name) as
          | { id: number }
          | undefined;
        if (taken && taken.id !== req.userId) throw conflict('Diesen Benutzernamen gibt es bereits.');
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, req.userId);
      }
      if (body.theme !== undefined) db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(body.theme, req.userId);
      if (body.colorMode !== undefined) {
        db.prepare('UPDATE users SET color_mode = ? WHERE id = ?').run(body.colorMode, req.userId);
      }
      return profile(req.userId);
    });

    api.put('/api/me/password', async (req, reply) => {
      const body = parse(passwordSchema, req.body);
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId) as { password_hash: string };
      if (!(await bcrypt.compare(body.currentPassword, row.password_hash))) {
        throw new HttpError(400, 'Das aktuelle Passwort ist falsch.');
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(body.newPassword, 10), req.userId);
      // Andere Sitzungen abmelden, diese behalten
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.userId, req.cookies[SESSION_COOKIE]);
      reply.status(200);
      return { ok: true };
    });

    api.put('/api/me/avatar', async (req) => {
      const body = parse(avatarSchema, req.body);
      const old = profile(req.userId).avatar;
      let avatar = old;
      if (body.imageData) avatar = await images.saveBase64(body.imageData);
      else if (body.removeImage) avatar = null;
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.userId);
      if (old && old !== avatar) images.delete(old);
      return profile(req.userId);
    });

    // Bilder
    api.get('/api/images/:name', async (req, reply) => {
      const p = images.path((req.params as { name: string }).name);
      if (!p || !fs.existsSync(p)) throw notFound('Bild nicht gefunden.');
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');
      return reply.type('image/webp').send(fs.createReadStream(p));
    });

    // Übungen
    api.get('/api/exercises', async (req) => repo.listExercises(req.userId));

    api.post('/api/exercises', async (req) => {
      const body = parse(exerciseSchema, req.body);
      const image = body.imageData ? await images.saveBase64(body.imageData) : null;
      const id = repo.insertExercise(req.userId, { name: body.name, description: body.description, image });
      return repo.getExercise(req.userId, id);
    });

    api.put('/api/exercises/:id', async (req) => {
      const id = idParam(req);
      const body = parse(exerciseSchema, req.body);
      const old = repo.getExercise(req.userId, id);
      let image = old.image;
      if (body.imageData) image = await images.saveBase64(body.imageData);
      else if (body.removeImage) image = null;
      repo.updateExercise(req.userId, id, { name: body.name, description: body.description, image });
      if (old.image && old.image !== image) images.delete(old.image);
      return repo.getExercise(req.userId, id);
    });

    api.delete('/api/exercises/:id', async (req) => {
      const ex = repo.deleteExercise(req.userId, idParam(req));
      images.delete(ex.image);
      return { ok: true };
    });

    // Stretching-Übungen
    api.get('/api/stretch-exercises', async (req) => repo.listStretchExercises(req.userId));

    api.post('/api/stretch-exercises', async (req) => {
      const body = parse(stretchExerciseSchema, req.body);
      const image = body.imageData ? await images.saveBase64(body.imageData) : null;
      const id = repo.insertStretchExercise(req.userId, { name: body.name, durationSec: body.durationSec, image });
      return repo.getStretchExercise(req.userId, id);
    });

    api.put('/api/stretch-exercises/:id', async (req) => {
      const id = idParam(req);
      const body = parse(stretchExerciseSchema, req.body);
      const old = repo.getStretchExercise(req.userId, id);
      let image = old.image;
      if (body.imageData) image = await images.saveBase64(body.imageData);
      else if (body.removeImage) image = null;
      repo.updateStretchExercise(req.userId, id, { name: body.name, durationSec: body.durationSec, image });
      if (old.image && old.image !== image) images.delete(old.image);
      return repo.getStretchExercise(req.userId, id);
    });

    api.delete('/api/stretch-exercises/:id', async (req) => {
      const ex = repo.deleteStretchExercise(req.userId, idParam(req));
      images.delete(ex.image);
      return { ok: true };
    });

    // Workouts
    api.get('/api/workouts', async (req) => repo.listWorkouts(req.userId));
    api.get('/api/workouts/:id', async (req) => repo.getWorkout(req.userId, idParam(req)));
    api.post('/api/workouts', async (req) => {
      const id = repo.saveWorkout(req.userId, null, parse(workoutSchema, req.body));
      return repo.getWorkout(req.userId, id);
    });
    api.put('/api/workouts/:id', async (req) => {
      const id = repo.saveWorkout(req.userId, idParam(req), parse(workoutSchema, req.body));
      return repo.getWorkout(req.userId, id);
    });
    api.delete('/api/workouts/:id', async (req) => {
      repo.deleteWorkout(req.userId, idParam(req));
      return { ok: true };
    });
    api.post('/api/workouts/:id/copy', async (req) => {
      const source = repo.getWorkout(req.userId, idParam(req));
      const newImages: string[] = [];
      try {
        const id = db.transaction(() => {
          // Übungen über den Namen zuordnen, fehlende samt Bild kopieren
          const exerciseIds = new Map<number, number>();
          for (const item of source.items) {
            if (exerciseIds.has(item.exerciseId)) continue;
            const own = repo.findExerciseByName(req.userId, item.exerciseName);
            if (own) {
              exerciseIds.set(item.exerciseId, own.id);
            } else {
              const image = images.copy(item.exerciseImage);
              if (image) newImages.push(image);
              exerciseIds.set(
                item.exerciseId,
                repo.insertExercise(req.userId, { name: item.exerciseName, description: item.exerciseDescription, image }),
              );
            }
          }
          const name =
            repo.findWorkoutIdByName(req.userId, source.name) === undefined
              ? source.name
              : uniqueCopyName(source.name, (n) => repo.findWorkoutIdByName(req.userId, n) !== undefined);
          return repo.saveWorkout(req.userId, null, {
            name,
            shared: false,
            rounds: source.rounds,
            restBetweenExercises: source.restBetweenExercises,
            restBetweenRounds: source.restBetweenRounds,
            items: source.items.map((i) => ({
              exerciseId: exerciseIds.get(i.exerciseId)!,
              type: i.type,
              value: i.value,
              sets: i.sets,
            })),
          });
        })();
        return repo.getWorkout(req.userId, id);
      } catch (err) {
        newImages.forEach((i) => images.delete(i));
        throw err;
      }
    });

    // Stretchings
    api.get('/api/stretchings', async (req) => repo.listStretchings(req.userId));
    api.get('/api/stretchings/:id', async (req) => repo.getStretching(req.userId, idParam(req)));
    api.post('/api/stretchings', async (req) => {
      const id = repo.saveStretching(req.userId, null, parse(stretchingSchema, req.body));
      return repo.getStretching(req.userId, id);
    });
    api.put('/api/stretchings/:id', async (req) => {
      const id = repo.saveStretching(req.userId, idParam(req), parse(stretchingSchema, req.body));
      return repo.getStretching(req.userId, id);
    });
    api.delete('/api/stretchings/:id', async (req) => {
      repo.deleteStretching(req.userId, idParam(req));
      return { ok: true };
    });
    api.post('/api/stretchings/:id/copy', async (req) => {
      const source = repo.getStretching(req.userId, idParam(req));
      const newImages: string[] = [];
      try {
        const id = db.transaction(() => {
          const ids = new Map<number, number>();
          for (const item of source.items) {
            if (ids.has(item.stretchExerciseId)) continue;
            const own = repo.findStretchExerciseByName(req.userId, item.name);
            if (own) {
              ids.set(item.stretchExerciseId, own.id);
            } else {
              const image = images.copy(item.image);
              if (image) newImages.push(image);
              ids.set(
                item.stretchExerciseId,
                repo.insertStretchExercise(req.userId, { name: item.name, durationSec: item.durationSec, image }),
              );
            }
          }
          const name =
            repo.findStretchingIdByName(req.userId, source.name) === undefined
              ? source.name
              : uniqueCopyName(source.name, (n) => repo.findStretchingIdByName(req.userId, n) !== undefined);
          return repo.saveStretching(req.userId, null, {
            name,
            shared: false,
            items: source.items.map((i) => ({ stretchExerciseId: ids.get(i.stretchExerciseId)! })),
          });
        })();
        return repo.getStretching(req.userId, id);
      } catch (err) {
        newImages.forEach((i) => images.delete(i));
        throw err;
      }
    });

    // Verlauf
    api.get('/api/executions', async (req) => repo.listExecutions(req.userId));
    api.post('/api/executions', async (req) => {
      const { plan, ...body } = parse(newExecutionSchema, req.body);
      // Planeintrag vorab prüfen, damit nichts halb gespeichert wird
      const entry = plan ? plans.entryForDate(req.userId, plan.planId, plan.entryId, plan.date) : null;
      return db.transaction(() => {
        const id = repo.insertExecution(req.userId, body);
        if (plan && entry && body.status === 'completed' && entry.kind === body.kind) {
          plans.addCompletion(plan.planId, plan.entryId, plan.date, id);
        }
        return { id };
      })();
    });
    api.delete('/api/executions/:id', async (req) => {
      repo.deleteExecution(req.userId, idParam(req));
      return { ok: true };
    });

    // Eigene Aktivitäten (Laufen, Radfahren, …)
    api.get('/api/activity-types', async (req) => plans.listActivityTypes(req.userId));
    api.post('/api/activity-types', async (req) =>
      plans.createActivityType(req.userId, parse(activityTypeSchema, req.body)),
    );
    api.put('/api/activity-types/:id', async (req) =>
      plans.updateActivityType(req.userId, idParam(req), parse(activityTypeSchema, req.body)),
    );
    api.delete('/api/activity-types/:id', async (req) => {
      plans.deleteActivityType(req.userId, idParam(req));
      return { ok: true };
    });

    // Trainingspläne
    api.get('/api/plans', async (req) => plans.listPlans(req.userId));
    api.get('/api/plans/:id', async (req) => plans.getPlan(req.userId, idParam(req)));
    api.post('/api/plans', async (req) => {
      const id = plans.savePlan(req.userId, null, parse(planSchema, req.body));
      return plans.getPlan(req.userId, id);
    });
    api.put('/api/plans/:id', async (req) => {
      const id = plans.savePlan(req.userId, idParam(req), parse(planSchema, req.body));
      return plans.getPlan(req.userId, id);
    });
    api.delete('/api/plans/:id', async (req) => {
      plans.deletePlan(req.userId, idParam(req));
      return { ok: true };
    });

    /** Aktivität (z. B. Laufen) bestätigen: legt einen Verlaufseintrag an und hakt den Tag ab. */
    api.post('/api/plans/:id/completions', async (req) => {
      const planId = idParam(req);
      const body = parse(completionSchema, req.body);
      const entry = plans.entryForDate(req.userId, planId, body.entryId, body.date);
      if (entry.kind !== 'activity') throw new HttpError(400, 'Workouts und Stretchings werden über „Starten“ erledigt.');
      // Startzeit: vom Browser (heute) oder 12:00 Uhr bei nachgetragenen Tagen
      const startedAt = body.startedAt ?? `${body.date}T12:00:00.000Z`;
      db.transaction(() => {
        const executionId = repo.insertExecution(req.userId, {
          kind: 'activity',
          name: entry.activityName ?? 'Aktivität',
          startedAt,
          durationSec: Math.round((body.durationMin ?? 0) * 60),
          distanceKm: body.distanceKm ?? null,
          rating: body.rating,
          status: 'completed',
        });
        plans.addCompletion(planId, body.entryId, body.date, executionId);
      })();
      return plans.getPlan(req.userId, planId);
    });

    api.delete('/api/plans/:id/completions/:entryId/:date', async (req) => {
      const planId = idParam(req);
      const { entryId, date } = req.params as { entryId: string; date: string };
      plans.removeCompletion(req.userId, planId, Number(entryId), date);
      return plans.getPlan(req.userId, planId);
    });

    // Export
    const stamp = () => new Date().toISOString().slice(0, 10);
    api.get('/api/export/plans', async (req, reply) => {
      reply.header('Content-Disposition', `attachment; filename="workouts-stretching-${stamp()}.json"`);
      return exportPlans(repo, images, req.userId);
    });
    api.get('/api/export/progress', async (req, reply) => {
      reply.header('Content-Disposition', `attachment; filename="fortschritt-${stamp()}.json"`);
      return exportProgress(repo, req.userId);
    });

    // Import
    api.post('/api/import/plans/preview', async (req) => {
      const data = parse(plansFileSchema, (req.body as { data?: unknown })?.data);
      return previewPlans(repo, req.userId, data);
    });
    api.post('/api/import/plans', async (req) => {
      const body = req.body as { data?: unknown; decisions?: unknown };
      const data = parse(plansFileSchema, body?.data);
      const decisions = parse(plansDecisionsSchema, body?.decisions);
      return importPlans(db, repo, images, req.userId, data, decisions);
    });
    api.post('/api/import/progress/preview', async (req) => {
      const data = parse(progressFileSchema, (req.body as { data?: unknown })?.data);
      return previewProgress(repo, req.userId, data);
    });
    api.post('/api/import/progress', async (req) => {
      const data = parse(progressFileSchema, (req.body as { data?: unknown })?.data);
      return importProgress(db, repo, req.userId, data);
    });
  });

  // ---------- Frontend ----------

  const staticDir = opts.staticDir;
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET') {
        return reply.status(404).send({ error: 'Nicht gefunden.' });
      }
      // SPA-Fallback: alle unbekannten Pfade liefern die App aus
      return reply.type('text/html').header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Nicht gefunden.' }));
  }

  app.addHook('onClose', async () => db.close());
  return { app, db };
}
