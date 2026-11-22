import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { entriesForDate, formatDay, isDone, todayISO } from '../plan/schedule';
import type { Plan, PlanSummary } from '../types';
import { PlanEntryRow } from './PlanEntryRow';

/** „Heute“ aus dem aktiven Trainingsplan für die Übersicht */
export function TodayCard() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<PlanSummary[]>('/api/plans')
      .then((list) => {
        const active = list.find((p) => p.active);
        return active ? api.get<Plan>(`/api/plans/${active.id}`) : null;
      })
      .then(setPlan)
      .catch(() => setPlan(null));
  }, []);

  if (plan === undefined) return null;
  if (plan === null) {
    return (
      <div className="card today-card" style={{ borderColor: 'var(--border)' }}>
        <div className="row">
          <span className="grow muted">📅 Noch kein aktiver Trainingsplan.</span>
          <button className="small" onClick={() => navigate('/app/plan/neu')}>
            Trainingsplan einrichten
          </button>
        </div>
      </div>
    );
  }

  const today = todayISO();
  const day = entriesForDate(plan, today);
  const allDone = !!day && day.entries.length > 0 && day.entries.every((e) => isDone(plan, e.id, today));

  return (
    <div className="card today-card">
      <div className="row" style={{ marginBottom: 6 }}>
        <div className="grow">
          <div className="muted small-text">
            Heute · {formatDay(today)}
            {day && ` · Woche ${day.week}/${plan.weeks}`}
          </div>
          <strong>
            📅 {plan.name} {allDone && '– alles erledigt 🎉'}
          </strong>
        </div>
        <button className="small" onClick={() => navigate(`/app/plan/${plan.id}/ansicht`)}>
          Plan ansehen
        </button>
      </div>
      {!day && (
        <div className="muted">
          {today < plan.startDate ? `Der Plan startet am ${formatDay(plan.startDate)}.` : 'Der Plan ist abgeschlossen.'}
        </div>
      )}
      {day && day.entries.length === 0 && <div className="muted">😴 Heute ist Ruhetag.</div>}
      {day?.entries.map((e) => <PlanEntryRow key={e.id} plan={plan} entry={e} date={today} onPlanChange={setPlan} />)}
    </div>
  );
}
