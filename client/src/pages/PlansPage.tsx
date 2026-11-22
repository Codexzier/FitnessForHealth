import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { endDate, formatDay, todayISO } from '../plan/schedule';
import type { PlanSummary } from '../types';

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PlanSummary[]>('/api/plans')
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, []);

  const today = todayISO();
  const status = (p: PlanSummary) =>
    today < p.startDate ? 'startet bald' : today > endDate(p) ? 'beendet' : 'läuft';

  return (
    <>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>Trainingspläne</h1>
        <button className="primary small" onClick={() => navigate('/app/plan/neu')}>
          + Neuer Trainingsplan
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {plans?.length === 0 && (
        <div className="empty">
          Noch kein Trainingsplan. Lege einen neuen an – auf Wunsch schlägt die App dir einen Plan vor.
        </div>
      )}
      <div className="tiles">
        {plans?.map((p) => (
          <div key={p.id} className="card tile">
            <div>
              {p.active && <span className="badge">Aktiv</span>}{' '}
              <span className="badge aborted">{status(p)}</span>
              <div className="tile-name" style={{ marginTop: 4 }}>
                📅 {p.name}
              </div>
            </div>
            <div className="muted small-text">
              {p.weeks} {p.weeks === 1 ? 'Woche' : 'Wochen'} · {formatDay(p.startDate)} – {formatDay(endDate(p))}
            </div>
            <div className="tile-actions">
              <button className="primary" onClick={() => navigate(`/app/plan/${p.id}/ansicht`)}>
                Ansehen
              </button>
              <button onClick={() => navigate(`/app/plan/${p.id}`)}>Bearbeiten</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
