import type { DB } from './db';
import type { ImageStore } from './images';
import { Repo, uniqueCopyName, type ExecutionInput } from './repo';
import {
  EXPORT_VERSION,
  PLANS_FORMAT,
  PROGRESS_FORMAT,
  type PlansDecisions,
  type PlansFile,
  type ProgressFile,
} from './schemas';

export function exportPlans(repo: Repo, images: ImageStore, userId: number) {
  const workouts = repo.listWorkouts(userId);
  const stretchings = repo.listStretchings(userId);
  return {
    format: PLANS_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: repo.listExercises(userId).map((e) => ({
      key: String(e.id),
      name: e.name,
      description: e.description,
      image: images.toDataUrl(e.image),
    })),
    stretchExercises: repo.listStretchExercises(userId).map((e) => ({
      key: String(e.id),
      name: e.name,
      durationSec: e.durationSec,
      image: images.toDataUrl(e.image),
    })),
    workouts: workouts.map((w) => ({
      name: w.name,
      rounds: w.rounds,
      restBetweenExercises: w.restBetweenExercises,
      restBetweenRounds: w.restBetweenRounds,
      items: w.items.map((i) => ({ exercise: String(i.exerciseId), type: i.type, value: i.value, sets: i.sets })),
    })),
    stretchings: stretchings.map((s) => ({ name: s.name, items: s.items.map((i) => String(i.stretchExerciseId)) })),
  };
}

export function exportProgress(repo: Repo, userId: number) {
  return {
    format: PROGRESS_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    executions: repo.listExecutions(userId).map(({ id: _id, ...e }) => e),
  };
}

export interface PreviewEntry {
  name: string;
  conflict: boolean;
}

export function previewPlans(repo: Repo, userId: number, data: PlansFile) {
  return {
    exercises: data.exercises.map((e) => ({ name: e.name, conflict: !!repo.findExerciseByName(userId, e.name) })),
    stretchExercises: data.stretchExercises.map((e) => ({
      name: e.name,
      conflict: !!repo.findStretchExerciseByName(userId, e.name),
    })),
    workouts: data.workouts.map((w) => ({
      name: w.name,
      conflict: repo.findWorkoutIdByName(userId, w.name) !== undefined,
      itemCount: w.items.length,
    })),
    stretchings: data.stretchings.map((s) => ({
      name: s.name,
      conflict: repo.findStretchingIdByName(userId, s.name) !== undefined,
      itemCount: s.items.length,
    })),
  };
}

export async function importPlans(
  db: DB,
  repo: Repo,
  images: ImageStore,
  userId: number,
  data: PlansFile,
  decisions: PlansDecisions,
) {
  // Bilder zuerst (asynchron) speichern, danach alles in einer synchronen Transaktion.
  const newImages: string[] = [];
  const exImages = new Map<string, string | null>();
  const seImages = new Map<string, string | null>();
  try {
    for (const e of data.exercises) {
      const img = e.image ? await images.saveBase64(e.image) : null;
      if (img) newImages.push(img);
      exImages.set(e.key, img);
    }
    for (const e of data.stretchExercises) {
      const img = e.image ? await images.saveBase64(e.image) : null;
      if (img) newImages.push(img);
      seImages.set(e.key, img);
    }
  } catch (err) {
    newImages.forEach((i) => images.delete(i));
    throw err;
  }

  const obsoleteImages: string[] = [];
  const result = { created: 0, overwritten: 0 };

  try {
    db.transaction(() => {
      const exIds = new Map<string, number>();
      for (const e of data.exercises) {
        const existing = repo.findExerciseByName(userId, e.name);
        const image = exImages.get(e.key) ?? null;
        if (existing && (decisions.exercises[e.name] ?? 'copy') === 'overwrite') {
          if (existing.image) obsoleteImages.push(existing.image);
          repo.updateExercise(userId, existing.id, { name: existing.name, description: e.description, image });
          exIds.set(e.key, existing.id);
          result.overwritten++;
        } else {
          const name = existing ? uniqueCopyName(e.name, (n) => !!repo.findExerciseByName(userId, n)) : e.name;
          exIds.set(e.key, repo.insertExercise(userId, { name, description: e.description, image }));
          result.created++;
        }
      }

      const seIds = new Map<string, number>();
      for (const e of data.stretchExercises) {
        const existing = repo.findStretchExerciseByName(userId, e.name);
        const image = seImages.get(e.key) ?? null;
        if (existing && (decisions.stretchExercises[e.name] ?? 'copy') === 'overwrite') {
          if (existing.image) obsoleteImages.push(existing.image);
          repo.updateStretchExercise(userId, existing.id, { name: existing.name, durationSec: e.durationSec, image });
          seIds.set(e.key, existing.id);
          result.overwritten++;
        } else {
          const name = existing ? uniqueCopyName(e.name, (n) => !!repo.findStretchExerciseByName(userId, n)) : e.name;
          seIds.set(e.key, repo.insertStretchExercise(userId, { name, durationSec: e.durationSec, image }));
          result.created++;
        }
      }

      for (const w of data.workouts) {
        const existingId = repo.findWorkoutIdByName(userId, w.name);
        const overwrite = existingId !== undefined && (decisions.workouts[w.name] ?? 'copy') === 'overwrite';
        const name =
          existingId !== undefined && !overwrite
            ? uniqueCopyName(w.name, (n) => repo.findWorkoutIdByName(userId, n) !== undefined)
            : overwrite
              ? repo.getWorkout(userId, existingId!).name
              : w.name;
        repo.saveWorkout(userId, overwrite ? existingId! : null, {
          name,
          rounds: w.rounds,
          restBetweenExercises: w.restBetweenExercises,
          restBetweenRounds: w.restBetweenRounds,
          items: w.items.map((i) => ({ exerciseId: exIds.get(i.exercise)!, type: i.type, value: i.value, sets: i.sets })),
        });
        overwrite ? result.overwritten++ : result.created++;
      }

      for (const s of data.stretchings) {
        const existingId = repo.findStretchingIdByName(userId, s.name);
        const overwrite = existingId !== undefined && (decisions.stretchings[s.name] ?? 'copy') === 'overwrite';
        const name =
          existingId !== undefined && !overwrite
            ? uniqueCopyName(s.name, (n) => repo.findStretchingIdByName(userId, n) !== undefined)
            : overwrite
              ? repo.getStretching(userId, existingId!).name
              : s.name;
        repo.saveStretching(userId, overwrite ? existingId! : null, {
          name,
          items: s.items.map((k) => ({ stretchExerciseId: seIds.get(k)! })),
        });
        overwrite ? result.overwritten++ : result.created++;
      }
    })();
  } catch (err) {
    newImages.forEach((i) => images.delete(i));
    throw err;
  }
  obsoleteImages.forEach((i) => images.delete(i));
  return result;
}

export function previewProgress(repo: Repo, userId: number, data: ProgressFile) {
  const duplicates = data.executions.filter((e) => repo.executionExists(userId, e as ExecutionInput)).length;
  return { total: data.executions.length, duplicates, new: data.executions.length - duplicates };
}

export function importProgress(db: DB, repo: Repo, userId: number, data: ProgressFile) {
  let imported = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const e of data.executions as ExecutionInput[]) {
      if (repo.executionExists(userId, e)) {
        skipped++;
      } else {
        repo.insertExecution(userId, e);
        imported++;
      }
    }
  })();
  return { imported, skipped };
}
