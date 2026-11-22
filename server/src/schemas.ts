import { z, ZodError, type ZodType } from 'zod';
import { badRequest } from './errors';

const name = z.string().trim().min(1, 'Bitte einen Namen angeben.').max(120, 'Der Name ist zu lang.');
const seconds = (label: string, min = 0) =>
  z.number({ invalid_type_error: `${label} muss eine Zahl sein.` }).int().min(min).max(24 * 3600);

export const createUserSchema = z.object({
  name,
  password: z.string().min(4, 'Das Passwort muss mindestens 4 Zeichen lang sein.').max(200),
});

export const loginSchema = z.object({
  userId: z.number().int(),
  password: z.string().max(200),
});

/** imageData: neues Bild als Data-URL; removeImage: vorhandenes Bild entfernen. */
const imageFields = {
  imageData: z.string().optional(),
  removeImage: z.boolean().optional(),
};

export const exerciseSchema = z.object({
  name,
  description: z.string().max(5000).default(''),
  ...imageFields,
});

export const stretchExerciseSchema = z.object({
  name,
  durationSec: seconds('Die Ausführungszeit', 1),
  ...imageFields,
});

export const workoutSchema = z.object({
  name,
  shared: z.boolean().default(false),
  rounds: z.number().int().min(1, 'Mindestens eine Runde.').max(100),
  restBetweenExercises: seconds('Die Pause zwischen Übungen'),
  restBetweenRounds: seconds('Die Pause zwischen Runden'),
  items: z
    .array(
      z.object({
        exerciseId: z.number().int(),
        type: z.enum(['time', 'reps']),
        value: z.number().int().min(1, 'Der Wert muss mindestens 1 sein.').max(24 * 3600),
        sets: z.number().int().min(1, 'Mindestens ein Satz.').max(100),
      }),
    )
    .max(200),
});

export const stretchingSchema = z.object({
  name,
  shared: z.boolean().default(false),
  items: z.array(z.object({ stretchExerciseId: z.number().int() })).max(200),
});

const rating = z.enum(['bad', 'medium', 'good']).nullable();
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Ungültiges Datum.');

export const executionSchema = z.object({
  kind: z.enum(['workout', 'stretching', 'activity']),
  name,
  startedAt: isoDate,
  durationSec: z.number().int().min(0),
  distanceKm: z.number().min(0).max(10000).nullable().optional(),
  rating,
  status: z.enum(['completed', 'aborted']),
});

const planDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.');

/** Ausführung, optional verknüpft mit einem Trainingsplan-Eintrag (wird dann abgehakt). */
export const newExecutionSchema = executionSchema.extend({
  plan: z.object({ planId: z.number().int(), entryId: z.number().int(), date: planDate }).optional(),
});

// ---------- Einstellungen ----------

export const THEMES = ['standard', 'ozean', 'sonnenuntergang', 'lavendel', 'kirsche'] as const;

export const profileSchema = z.object({
  name: name.optional(),
  theme: z.enum(THEMES).optional(),
  colorMode: z.enum(['system', 'light', 'dark']).optional(),
});

export const passwordSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: createUserSchema.shape.password,
});

export const avatarSchema = z.object({ imageData: z.string().optional(), removeImage: z.boolean().optional() });

// ---------- Trainingspläne ----------

export const activityTypeSchema = z.object({
  name,
  icon: z.string().trim().min(1).max(16).default('🏃'),
});

export const planSchema = z.object({
  name,
  weeks: z.number().int().min(1, 'Mindestens eine Woche.').max(104, 'Höchstens 104 Wochen.'),
  startDate: planDate,
  active: z.boolean().default(false),
  entries: z
    .array(
      z.object({
        id: z.number().int().optional(),
        week: z.number().int().min(0).max(104),
        weekday: z.number().int().min(1).max(7),
        kind: z.enum(['workout', 'stretching', 'activity']),
        workoutId: z.number().int().nullable().default(null),
        stretchingId: z.number().int().nullable().default(null),
        activityTypeId: z.number().int().nullable().default(null),
        targetType: z.enum(['duration', 'distance']).nullable().default(null),
        targetValue: z.number().min(0).max(10000).nullable().default(null),
      }),
    )
    .max(2000),
  overrides: z
    .array(z.object({ week: z.number().int().min(1).max(104), weekday: z.number().int().min(1).max(7) }))
    .max(800)
    .default([]),
});

export const completionSchema = z.object({
  entryId: z.number().int(),
  date: planDate,
  startedAt: isoDate.optional(),
  durationMin: z.number().min(0).max(24 * 60).nullable().optional(),
  distanceKm: z.number().min(0).max(10000).nullable().optional(),
  rating,
});

// ---------- Export-/Importformat ----------

export const PLANS_FORMAT = 'fitnessforhealth-plans';
export const PROGRESS_FORMAT = 'fitnessforhealth-progress';
export const EXPORT_VERSION = 1;

const ref = z.union([z.string(), z.number()]).transform(String);

export const plansFileSchema = z
  .object({
    format: z.literal(PLANS_FORMAT, { errorMap: () => ({ message: 'Die Datei ist kein Workout-/Stretching-Export.' }) }),
    version: z.number().int(),
    exercises: z
      .array(z.object({ key: ref, name, description: z.string().default(''), image: z.string().nullable().default(null) }))
      .default([]),
    stretchExercises: z
      .array(
        z.object({ key: ref, name, durationSec: seconds('Die Ausführungszeit', 1), image: z.string().nullable().default(null) }),
      )
      .default([]),
    workouts: z
      .array(
        z.object({
          name,
          rounds: z.number().int().min(1).max(100),
          restBetweenExercises: seconds('Die Pause zwischen Übungen'),
          restBetweenRounds: seconds('Die Pause zwischen Runden'),
          items: z.array(
            z.object({
              exercise: ref,
              type: z.enum(['time', 'reps']),
              value: z.number().int().min(1),
              sets: z.number().int().min(1).max(100),
            }),
          ),
        }),
      )
      .default([]),
    stretchings: z.array(z.object({ name, items: z.array(ref) })).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.version > EXPORT_VERSION) {
      ctx.addIssue({ code: 'custom', message: `Dateiversion ${data.version} wird noch nicht unterstützt.` });
    }
    const exKeys = new Set(data.exercises.map((e) => e.key));
    const seKeys = new Set(data.stretchExercises.map((e) => e.key));
    for (const w of data.workouts) {
      for (const it of w.items) {
        if (!exKeys.has(it.exercise)) {
          ctx.addIssue({ code: 'custom', message: `Workout „${w.name}“ verweist auf eine unbekannte Übung.` });
        }
      }
    }
    for (const s of data.stretchings) {
      for (const k of s.items) {
        if (!seKeys.has(k)) {
          ctx.addIssue({ code: 'custom', message: `Stretching „${s.name}“ verweist auf eine unbekannte Übung.` });
        }
      }
    }
  });

export type PlansFile = z.infer<typeof plansFileSchema>;

export const progressFileSchema = z
  .object({
    format: z.literal(PROGRESS_FORMAT, { errorMap: () => ({ message: 'Die Datei ist kein Fortschritts-Export.' }) }),
    version: z.number().int(),
    executions: z.array(executionSchema),
  })
  .superRefine((data, ctx) => {
    if (data.version > EXPORT_VERSION) {
      ctx.addIssue({ code: 'custom', message: `Dateiversion ${data.version} wird noch nicht unterstützt.` });
    }
  });

export type ProgressFile = z.infer<typeof progressFileSchema>;

const decision = z.enum(['overwrite', 'copy']);
export const plansDecisionsSchema = z
  .object({
    exercises: z.record(decision).default({}),
    stretchExercises: z.record(decision).default({}),
    workouts: z.record(decision).default({}),
    stretchings: z.record(decision).default({}),
  })
  .default({});

export type PlansDecisions = z.infer<typeof plansDecisionsSchema>;

export function formatZodError(err: ZodError): string {
  const msgs = err.issues.map((i) => {
    const where = i.path.length ? ` (${i.path.join('.')})` : '';
    return i.code === 'custom' || i.message.match(/[äöüÄÖÜß]|Bitte|muss|Mindestens/) ? i.message : `${i.message}${where}`;
  });
  return [...new Set(msgs)].slice(0, 8).join(' ');
}

export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest(formatZodError(r.error));
  return r.data;
}
