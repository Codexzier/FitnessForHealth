import { useEffect, useState } from 'react';
import { api } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { formatDate, formatDuration, formatTime, ratingLabel } from '../format';
import type { Execution } from '../types';

export default function History() {
  const [items, setItems] = useState<Execution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Execution | null>(null);

  useEffect(() => {
    api
      .get<Execution[]>('/api/executions')
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  const completed = items?.filter((i) => i.status === 'completed') ?? [];
  const totalSec = completed.reduce((s, i) => s + i.durationSec, 0);

  return (
    <>
      <h1>Fitness-Verlauf</h1>
      {error && <div className="error">{error}</div>}
      {items && items.length > 0 && (
        <p className="muted">
          {completed.length} abgeschlossene {completed.length === 1 ? 'Einheit' : 'Einheiten'} · insgesamt{' '}
          {formatDuration(totalSec)}
        </p>
      )}
      {items?.length === 0 && <div className="empty">Noch keine Einheiten durchgeführt.</div>}
      <div className="list">
        {items?.map((e) => (
          <div key={e.id} className="list-item history-item">
            <div className="li-date">
              <strong>{formatDate(e.startedAt)}</strong>
              <span className="muted small-text">{formatTime(e.startedAt)} Uhr</span>
            </div>
            <div className="li-main">
              <div className="li-title">
                {e.kind === 'workout' ? '🏋️' : e.kind === 'stretching' ? '🧘' : '🏃'} {e.name}
              </div>
              <div className="li-sub">
                {e.kind === 'workout' ? 'Workout' : e.kind === 'stretching' ? 'Stretching' : 'Aktivität'}
                {e.durationSec > 0 && ` · Dauer ${formatDuration(e.durationSec)}`}
                {e.distanceKm != null && ` · ${e.distanceKm.toLocaleString('de-DE')} km`}
              </div>
            </div>
            {e.status === 'aborted' ? (
              <span className="badge aborted">abgebrochen</span>
            ) : e.rating ? (
              <span className={`badge ${e.rating}`}>{ratingLabel[e.rating]}</span>
            ) : null}
            <button className="icon small ghost" aria-label="Eintrag löschen" onClick={() => setToDelete(e)}>
              🗑
            </button>
          </div>
        ))}
      </div>
      {toDelete && (
        <ConfirmDialog
          title="Eintrag löschen?"
          text={`„${toDelete.name}“ vom ${formatDate(toDelete.startedAt)} wird aus dem Verlauf entfernt.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const id = toDelete.id;
            setToDelete(null);
            try {
              await api.del(`/api/executions/${id}`);
              setItems((list) => list?.filter((x) => x.id !== id) ?? null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      )}
    </>
  );
}
