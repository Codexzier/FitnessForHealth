import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Exercise, StretchExercise } from '../types';
import { ImagePicker, type ImageValue } from './ImagePicker';

export function ExerciseForm({
  exercise,
  onSaved,
  onCancel,
  onDelete,
}: {
  exercise: Exercise | null;
  onSaved: (e: Exercise) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [description, setDescription] = useState(exercise?.description ?? '');
  const [image, setImage] = useState<ImageValue>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // nicht an ein umgebendes Formular weiterreichen
    setSaving(true);
    setError(null);
    try {
      const body = { name, description, ...image };
      const saved = exercise
        ? await api.put<Exercise>(`/api/exercises/${exercise.id}`, body)
        : await api.post<Exercise>('/api/exercises', body);
      setImage({});
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={!exercise} />
      </label>
      <label>
        Beschreibung
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </label>
      <ImagePicker current={exercise?.image ?? null} value={image} onChange={setImage} />
      <div className="row">
        {onDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Löschen
          </button>
        )}
        <span className="grow" />
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

export function StretchExerciseForm({
  exercise,
  onSaved,
  onCancel,
  onDelete,
}: {
  exercise: StretchExercise | null;
  onSaved: (e: StretchExercise) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [duration, setDuration] = useState(String(exercise?.durationSec ?? 30));
  const [image, setImage] = useState<ImageValue>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // nicht an ein umgebendes Formular weiterreichen
    setSaving(true);
    setError(null);
    try {
      const body = { name, durationSec: Number(duration), ...image };
      const saved = exercise
        ? await api.put<StretchExercise>(`/api/stretch-exercises/${exercise.id}`, body)
        : await api.post<StretchExercise>('/api/stretch-exercises', body);
      setImage({});
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error">{error}</div>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={!exercise} />
      </label>
      <label>
        Ausführungszeit <span className="hint">(Sekunden)</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          required
        />
      </label>
      <ImagePicker current={exercise?.image ?? null} value={image} onChange={setImage} icon="🧘" />
      <div className="row">
        {onDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Löschen
          </button>
        )}
        <span className="grow" />
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
        )}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}
