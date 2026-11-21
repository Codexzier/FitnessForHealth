import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ExerciseForm } from '../components/ExerciseForms';
import { ConfirmDialog, Modal } from '../components/Modal';
import { ReorderList, moveItem } from '../components/ReorderList';
import { Thumb } from '../components/Thumb';
import { formatMinutes } from '../format';
import { buildWorkoutSteps, estimateDuration } from '../timer/engine';
import type { Exercise, ItemType, Workout } from '../types';

interface DraftItem {
  key: number;
  exerciseId: number;
  type: ItemType;
  value: string;
  sets: string;
}

let keySeq = 1;

export default function WorkoutEditor() {
  const { id } = useParams();
  const isNew = id === 'neu';
  const navigate = useNavigate();

  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [name, setName] = useState('');
  const [rounds, setRounds] = useState('3');
  const [restEx, setRestEx] = useState('15');
  const [restRound, setRestRound] = useState('60');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newExerciseOpen, setNewExerciseOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api
      .get<Exercise[]>('/api/exercises')
      .then(setExercises)
      .catch((e) => setError(e.message));
    if (!isNew) {
      api
        .get<Workout>(`/api/workouts/${id}`)
        .then((w) => {
          setName(w.name);
          setRounds(String(w.rounds));
          setRestEx(String(w.restBetweenExercises));
          setRestRound(String(w.restBetweenRounds));
          setItems(
            w.items.map((i) => ({
              key: keySeq++,
              exerciseId: i.exerciseId,
              type: i.type,
              value: String(i.value),
              sets: String(i.sets),
            })),
          );
          setLoaded(true);
        })
        .catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  const exById = new Map(exercises?.map((e) => [e.id, e]));

  const addExercise = (ex: Exercise) => {
    setItems((list) => [...list, { key: keySeq++, exerciseId: ex.id, type: 'time', value: '30', sets: '1' }]);
    setLibraryOpen(false);
  };

  const update = (key: number, patch: Partial<DraftItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const payload = () => ({
    name,
    rounds: Number(rounds),
    restBetweenExercises: Number(restEx || 0),
    restBetweenRounds: Number(restRound || 0),
    items: items.map((i) => ({ exerciseId: i.exerciseId, type: i.type, value: Number(i.value), sets: Number(i.sets) })),
  });

  const estimate = estimateDuration(
    buildWorkoutSteps({
      rounds: Number(rounds) || 1,
      restBetweenExercises: Number(restEx) || 0,
      restBetweenRounds: Number(restRound) || 0,
      items: items.map((i) => ({
        name: '',
        image: null,
        type: i.type,
        value: Number(i.value) || 0,
        sets: Number(i.sets) || 1,
      })),
    }),
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) await api.post('/api/workouts', payload());
      else await api.put(`/api/workouts/${id}`, payload());
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!loaded) return error ? <div className="error">{error}</div> : <p className="muted">Lade …</p>;

  const library = (
    <ExerciseLibrary
      exercises={exercises ?? []}
      onPick={addExercise}
      onNew={() => {
        setLibraryOpen(false);
        setNewExerciseOpen(true);
      }}
    />
  );

  return (
    <form onSubmit={save}>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>{isNew ? 'Neues Workout' : 'Workout bearbeiten'}</h1>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split editor">
        <div className="list" style={{ gap: 16 }}>
          <div className="card">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={isNew} />
            </label>
            <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label>
                Runden
                <input type="number" inputMode="numeric" min={1} max={100} value={rounds} onChange={(e) => setRounds(e.target.value)} required />
              </label>
              <label>
                Pause Übungen <span className="hint">(Sek.)</span>
                <input type="number" inputMode="numeric" min={0} value={restEx} onChange={(e) => setRestEx(e.target.value)} />
              </label>
              <label>
                Pause Runden <span className="hint">(Sek.)</span>
                <input type="number" inputMode="numeric" min={0} value={restRound} onChange={(e) => setRestRound(e.target.value)} />
              </label>
            </div>
            <p className="muted small-text" style={{ margin: '10px 0 0' }}>
              Geschätzte Dauer: ca. {formatMinutes(estimate.seconds)}
              {estimate.hasReps && ' zzgl. Wiederholungs-Übungen'} (inkl. 5-s-Countdown vor jedem Satz)
            </p>
          </div>

          <div>
            <h2>Übungen im Workout</h2>
            {items.length === 0 && <div className="empty">Noch keine Übungen. Füge Übungen aus der Liste hinzu.</div>}
            <ReorderList
              items={items}
              keyOf={(i) => i.key}
              onMove={(from, to) => setItems((list) => moveItem(list, from, to))}
              render={(item, index, controls) => {
                const ex = exById.get(item.exerciseId);
                return (
                  <div className="item-editor">
                    <div className="item-head">
                      {controls.handle}
                      <Thumb image={ex?.image ?? null} />
                      <div className="li-main">
                        <div className="li-title">
                          {index + 1}. {ex?.name ?? '…'}
                        </div>
                      </div>
                      {controls.arrows}
                      <button
                        type="button"
                        className="icon small ghost"
                        aria-label="Entfernen"
                        onClick={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="item-fields">
                      <label>
                        Typ
                        <div className="segmented">
                          <button
                            type="button"
                            className={item.type === 'time' ? 'active' : ''}
                            onClick={() => update(item.key, { type: 'time', value: item.type === 'time' ? item.value : '30' })}
                          >
                            Zeit
                          </button>
                          <button
                            type="button"
                            className={item.type === 'reps' ? 'active' : ''}
                            onClick={() => update(item.key, { type: 'reps', value: item.type === 'reps' ? item.value : '10' })}
                          >
                            Wdh.
                          </button>
                        </div>
                      </label>
                      <label>
                        {item.type === 'time' ? 'Sekunden' : 'Wiederh.'}
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={item.value}
                          onChange={(e) => update(item.key, { value: e.target.value })}
                          required
                        />
                      </label>
                      <label>
                        Sätze
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          value={item.sets}
                          onChange={(e) => update(item.key, { sets: e.target.value })}
                          required
                        />
                      </label>
                    </div>
                  </div>
                );
              }}
            />
            <div className="row mobile-only" style={{ marginTop: 12 }}>
              <button type="button" style={{ width: '100%' }} onClick={() => setLibraryOpen(true)}>
                + Übung hinzufügen
              </button>
            </div>
          </div>

          <div className="row">
            {!isNew && (
              <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
                Löschen
              </button>
            )}
            <span className="grow" />
            <button type="button" onClick={() => navigate('/app')}>
              Abbrechen
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </div>

        <aside className="sticky-col desktop-only">
          <div className="card">{library}</div>
        </aside>
      </div>

      {libraryOpen && (
        <Modal title="Übung hinzufügen" onClose={() => setLibraryOpen(false)}>
          {library}
        </Modal>
      )}
      {newExerciseOpen && (
        <Modal title="Neue Übung" onClose={() => setNewExerciseOpen(false)}>
          <ExerciseForm
            exercise={null}
            onCancel={() => setNewExerciseOpen(false)}
            onSaved={(ex) => {
              setExercises((list) => [...(list ?? []), ex].sort((a, b) => a.name.localeCompare(b.name, 'de')));
              addExercise(ex);
              setNewExerciseOpen(false);
            }}
          />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Workout löschen?"
          text={`„${name}“ wird gelöscht. Der Verlauf bleibt erhalten.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/workouts/${id}`);
              navigate('/app');
            } catch (err) {
              setConfirmDelete(false);
              setError((err as Error).message);
            }
          }}
        />
      )}
    </form>
  );
}

function ExerciseLibrary({
  exercises,
  onPick,
  onNew,
}: {
  exercises: Exercise[];
  onPick: (e: Exercise) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 className="grow" style={{ margin: 0 }}>
          Übungen
        </h3>
        <button type="button" className="small primary" onClick={onNew}>
          + Neue Übung
        </button>
      </div>
      {exercises.length > 6 && (
        <input
          type="search"
          placeholder="Suchen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 10, marginTop: 0 }}
        />
      )}
      {exercises.length === 0 && <p className="muted">Noch keine Übungen vorhanden. Lege eine neue Übung an.</p>}
      <div className="list">
        {filtered.map((e) => (
          <div key={e.id} className="list-item clickable" onClick={() => onPick(e)}>
            <Thumb image={e.image} />
            <div className="li-main">
              <div className="li-title">{e.name}</div>
              {e.description && <div className="li-sub">{e.description.slice(0, 80)}</div>}
            </div>
            <span className="muted" style={{ fontSize: '1.4rem' }}>
              +
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
