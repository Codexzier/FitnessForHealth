import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { StretchExerciseForm } from '../components/ExerciseForms';
import { ConfirmDialog, Modal } from '../components/Modal';
import { ReorderList, moveItem } from '../components/ReorderList';
import { Thumb } from '../components/Thumb';
import { formatMinutes } from '../format';
import { COUNTDOWN_SEC } from '../timer/engine';
import type { StretchExercise, Stretching } from '../types';

interface DraftItem {
  key: number;
  stretchExerciseId: number;
}

let keySeq = 1;

export default function StretchingEditor() {
  const { id } = useParams();
  const isNew = id === 'neu';
  const navigate = useNavigate();

  const [library, setLibrary] = useState<StretchExercise[] | null>(null);
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api
      .get<StretchExercise[]>('/api/stretch-exercises')
      .then(setLibrary)
      .catch((e) => setError(e.message));
    if (!isNew) {
      api
        .get<Stretching>(`/api/stretchings/${id}`)
        .then((s) => {
          setName(s.name);
          setItems(s.items.map((i) => ({ key: keySeq++, stretchExerciseId: i.stretchExerciseId })));
          setLoaded(true);
        })
        .catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  const byId = new Map(library?.map((e) => [e.id, e]));
  const totalSec = items.reduce((s, i) => s + (byId.get(i.stretchExerciseId)?.durationSec ?? 0) + COUNTDOWN_SEC, 0);

  const add = (ex: StretchExercise) => {
    setItems((list) => [...list, { key: keySeq++, stretchExerciseId: ex.id }]);
    setLibraryOpen(false);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { name, items: items.map((i) => ({ stretchExerciseId: i.stretchExerciseId })) };
    try {
      if (isNew) await api.post('/api/stretchings', body);
      else await api.put(`/api/stretchings/${id}`, body);
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!loaded) return error ? <div className="error">{error}</div> : <p className="muted">Lade …</p>;

  const libraryView = (
    <StretchLibrary
      exercises={library ?? []}
      onPick={add}
      onNew={() => {
        setLibraryOpen(false);
        setNewOpen(true);
      }}
    />
  );

  return (
    <form onSubmit={save}>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>{isNew ? 'Neues Stretching' : 'Stretching bearbeiten'}</h1>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split editor">
        <div className="list" style={{ gap: 16 }}>
          <div className="card">
            <label style={{ marginBottom: 6 }}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={isNew} />
            </label>
            <p className="muted small-text" style={{ margin: 0 }}>
              Gesamtdauer: ca. {formatMinutes(totalSec)} (inkl. 5-s-Countdown vor jeder Übung)
            </p>
          </div>

          <div>
            <h2>Übungen im Stretching</h2>
            {items.length === 0 && <div className="empty">Noch keine Übungen. Füge Stretching-Übungen hinzu.</div>}
            <ReorderList
              items={items}
              keyOf={(i) => i.key}
              onMove={(from, to) => setItems((list) => moveItem(list, from, to))}
              render={(item, index, controls) => {
                const ex = byId.get(item.stretchExerciseId);
                return (
                  <div className="list-item">
                    {controls.handle}
                    <Thumb image={ex?.image ?? null} icon="🧘" />
                    <div className="li-main">
                      <div className="li-title">
                        {index + 1}. {ex?.name ?? '…'}
                      </div>
                      <div className="li-sub">{ex?.durationSec ?? 0} Sekunden</div>
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
                );
              }}
            />
            <div className="row mobile-only" style={{ marginTop: 12 }}>
              <button type="button" style={{ width: '100%' }} onClick={() => setLibraryOpen(true)}>
                + Stretching-Übung hinzufügen
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
          <div className="card">{libraryView}</div>
        </aside>
      </div>

      {libraryOpen && (
        <Modal title="Stretching-Übung hinzufügen" onClose={() => setLibraryOpen(false)}>
          {libraryView}
        </Modal>
      )}
      {newOpen && (
        <Modal title="Neue Stretching-Übung" onClose={() => setNewOpen(false)}>
          <StretchExerciseForm
            exercise={null}
            onCancel={() => setNewOpen(false)}
            onSaved={(ex) => {
              setLibrary((list) => [...(list ?? []), ex].sort((a, b) => a.name.localeCompare(b.name, 'de')));
              add(ex);
              setNewOpen(false);
            }}
          />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Stretching löschen?"
          text={`„${name}“ wird gelöscht. Der Verlauf bleibt erhalten.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/stretchings/${id}`);
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

function StretchLibrary({
  exercises,
  onPick,
  onNew,
}: {
  exercises: StretchExercise[];
  onPick: (e: StretchExercise) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 className="grow" style={{ margin: 0 }}>
          Stretching-Übungen
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
      {exercises.length === 0 && <p className="muted">Noch keine Stretching-Übungen vorhanden.</p>}
      <div className="list">
        {filtered.map((e) => (
          <div key={e.id} className="list-item clickable" onClick={() => onPick(e)}>
            <Thumb image={e.image} icon="🧘" />
            <div className="li-main">
              <div className="li-title">{e.name}</div>
              <div className="li-sub">{e.durationSec} Sekunden</div>
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
