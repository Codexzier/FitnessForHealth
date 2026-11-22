import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { PlanEntryRow } from '../components/PlanEntryRow';
import { dateOf, endDate, entriesFor, formatDay, isOverridden, progress, todayISO, weekOf, WEEKDAYS } from '../plan/schedule';
import type { Plan } from '../types';

export default function PlanView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [week, setWeek] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  useEffect(() => {
    api
      .get<Plan>(`/api/plans/${id}`)
      .then((p) => {
        setPlan(p);
        setWeek(Math.min(p.weeks, Math.max(1, weekOf(p.startDate, todayISO()))));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!plan) return <p className="muted">Lade …</p>;

  const prog = progress(plan, today);
  const currentWeek = weekOf(plan.startDate, today);

  async function activate() {
    try {
      const p = plan!;
      setPlan(
        await api.put<Plan>(`/api/plans/${p.id}`, {
          name: p.name,
          weeks: p.weeks,
          startDate: p.startDate,
          active: true,
          entries: p.entries,
          overrides: p.overrides,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <div className="section-title">
        <div>
          {plan.active && <span className="badge">Aktiver Plan</span>}
          <h1 style={{ margin: '4px 0 0' }}>{plan.name}</h1>
          <div className="muted small-text">
            {formatDay(plan.startDate)} – {formatDay(endDate(plan))} · {plan.weeks} Wochen
          </div>
        </div>
        <div className="row">
          {!plan.active && (
            <button className="small" onClick={activate}>
              Als aktiven Plan setzen
            </button>
          )}
          <button className="small" onClick={() => navigate(`/app/plan/${plan.id}`)}>
            Bearbeiten
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <strong className="grow">Fortschritt</strong>
          <span className="muted small-text">
            {prog.done} von {prog.total} Einheiten erledigt
            {prog.due > prog.done && ` · ${prog.due - prog.done} offen bis heute`}
          </span>
        </div>
        <div className="progress-line">
          <div style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="week-tabs" role="tablist">
        {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => (
          <button key={w} className={w === week ? 'active' : ''} onClick={() => setWeek(w)} role="tab" aria-selected={w === week}>
            Woche {w}
            {w === currentWeek && ' •'}
          </button>
        ))}
      </div>

      <div className="week-days">
        {[1, 2, 3, 4, 5, 6, 7]
          .map((wd) => ({ wd, date: dateOf(plan, week, wd) }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(({ wd, date }) => {
          const entries = entriesFor(plan, week, wd);
          return (
            <div key={wd} className={`day-card ${date === today ? 'today' : ''} ${isOverridden(plan, week, wd) ? 'override' : ''}`}>
              <div className="day-head">
                <span>
                  {WEEKDAYS[wd - 1]} {date === today && <span className="badge">Heute</span>}
                </span>
                <span className="muted small-text">{formatDay(date).slice(4)}</span>
              </div>
              {entries.length === 0 ? (
                <div className="muted small-text" style={{ padding: '6px 0' }}>
                  😴 Ruhetag
                </div>
              ) : (
                entries.map((e) => <PlanEntryRow key={e.id} plan={plan} entry={e} date={date} onPlanChange={setPlan} compact />)
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
