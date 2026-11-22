import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { TodayCard } from '../components/TodayCard';
import { Thumb } from '../components/Thumb';
import { formatMinutes } from '../format';
import { buildStretchingSteps, buildWorkoutSteps, estimateDuration } from '../timer/engine';
import type { Stretching, Workout } from '../types';
import { toWorkoutPlan } from '../timer/plans';

export default function Overview() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [stretchings, setStretchings] = useState<Stretching[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [copying, setCopying] = useState<string | null>(null);

  async function copy(kind: 'workouts' | 'stretchings', id: number) {
    setCopying(`${kind}-${id}`);
    try {
      const created = await api.post<{ id: number }>(`/api/${kind}/${id}/copy`);
      navigate(`/app/${kind === 'workouts' ? 'workout' : 'stretching'}/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCopying(null);
    }
  }

  const ownerInfo = (item: { shared: boolean; ownerId: number; ownerName: string }) =>
    item.ownerId !== user?.id ? (
      <span className="muted small-text"> · von {item.ownerName}</span>
    ) : item.shared ? (
      <span className="muted small-text" title="Für alle Benutzer verfügbar">
        {' '}
        · 👥 geteilt
      </span>
    ) : null;

  const actionFor = (kind: 'workouts' | 'stretchings', item: { id: number; ownerId: number }) =>
    item.ownerId === user?.id ? (
      <button onClick={() => navigate(`/app/${kind === 'workouts' ? 'workout' : 'stretching'}/${item.id}`)}>Bearbeiten</button>
    ) : (
      <button
        onClick={() => copy(kind, item.id)}
        disabled={copying === `${kind}-${item.id}`}
        title="Als eigene Kopie übernehmen und bearbeiten"
      >
        Kopieren
      </button>
    );

  useEffect(() => {
    Promise.all([api.get<Workout[]>('/api/workouts'), api.get<Stretching[]>('/api/stretchings')])
      .then(([w, s]) => {
        setWorkouts(w);
        setStretchings(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error && !workouts) return <div className="error">{error}</div>;
  if (!workouts || !stretchings) return <p className="muted">Lade …</p>;

  return (
    <>
      {error && <div className="error">{error}</div>}
      <TodayCard />
      <div className="section-title">
        <h1 style={{ margin: 0 }}>Workouts</h1>
        <button className="small" onClick={() => navigate('/app/workout/neu')}>
          + Neues Workout
        </button>
      </div>
      {workouts.length === 0 ? (
        <div className="empty">Noch keine Workouts. Lege oben rechts mit „+“ ein neues Workout an.</div>
      ) : (
        <div className="tiles">
          {workouts.map((w) => {
            const est = estimateDuration(buildWorkoutSteps(toWorkoutPlan(w)));
            return (
              <div key={w.id} className="card tile">
                <div className="tile-head">
                  <Thumb image={w.items.find((i) => i.exerciseImage)?.exerciseImage ?? null} large />
                  <div>
                    <span className="badge">Workout</span>
                    <div className="tile-name">{w.name}</div>
                  </div>
                </div>
                <div className="muted small-text">
                  {w.rounds} {w.rounds === 1 ? 'Runde' : 'Runden'} · {w.items.length}{' '}
                  {w.items.length === 1 ? 'Übung' : 'Übungen'} · ca. {formatMinutes(est.seconds)}
                  {est.hasReps && ' + Wdh.'}
                  {ownerInfo(w)}
                </div>
                <div className="tile-actions">
                  <button
                    className="primary"
                    disabled={w.items.length === 0}
                    onClick={() => navigate(`/app/run/workout/${w.id}`)}
                  >
                    ▶ Starten
                  </button>
                  {actionFor('workouts', w)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title">
        <h1 style={{ margin: 0 }}>Stretching</h1>
        <button className="small" onClick={() => navigate('/app/stretching/neu')}>
          + Neues Stretching
        </button>
      </div>
      {stretchings.length === 0 ? (
        <div className="empty">Noch keine Stretchings. Lege oben rechts mit „+“ ein neues Stretching an.</div>
      ) : (
        <div className="tiles">
          {stretchings.map((s) => {
            const est = estimateDuration(buildStretchingSteps({ items: s.items }));
            return (
              <div key={s.id} className="card tile">
                <div className="tile-head">
                  <Thumb image={s.items.find((i) => i.image)?.image ?? null} icon="🧘" large />
                  <div>
                    <span className="badge stretch">Stretching</span>
                    <div className="tile-name">{s.name}</div>
                  </div>
                </div>
                <div className="muted small-text">
                  {s.items.length} {s.items.length === 1 ? 'Übung' : 'Übungen'} · ca. {formatMinutes(est.seconds)}
                  {ownerInfo(s)}
                </div>
                <div className="tile-actions">
                  <button
                    className="primary"
                    disabled={s.items.length === 0}
                    onClick={() => navigate(`/app/run/stretching/${s.id}`)}
                  >
                    ▶ Starten
                  </button>
                  {actionFor('stretchings', s)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
