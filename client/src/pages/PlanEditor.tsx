import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ConfirmDialog, Modal } from '../components/Modal';
import { defaultRunMinutes, FOCUS_OPTIONS, recommendPattern, TRAINING_DAYS, type Focus } from '../plan/recommend';
import { dateOf, endDate, entryIcon, entryTitle, formatDay, nextMonday, WEEKDAYS } from '../plan/schedule';
import type { ActivityType, Plan, PlanEntry, PlanSummary, Stretching, TargetType, Workout } from '../types';
import { ActivityForm } from './SettingsPage';

type DraftEntry = PlanEntry & { key: number };
let keySeq = 1;
const withKey = (e: PlanEntry): DraftEntry => ({ ...e, key: keySeq++ });
const slot = (week: number, weekday: number) => `${week}-${weekday}`;

export default function PlanEditor() {
  const { id } = useParams();
  const isNew = id === 'neu';
  const navigate = useNavigate();

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [stretchings, setStretchings] = useState<Stretching[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('4');
  const [startDate, setStartDate] = useState(nextMonday());
  const [active, setActive] = useState(true);
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addFor, setAddFor] = useState<{ week: number; weekday: number } | null>(null);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Workout[]>('/api/workouts'),
      api.get<Stretching[]>('/api/stretchings'),
      api.get<ActivityType[]>('/api/activity-types'),
      isNew ? api.get<PlanSummary[]>('/api/plans') : Promise.resolve(null),
      isNew ? Promise.resolve(null) : api.get<Plan>(`/api/plans/${id}`),
    ])
      .then(([w, s, a, list, plan]) => {
        setWorkouts(w);
        setStretchings(s);
        setActivities(a);
        if (plan) {
          setName(plan.name);
          setWeeks(String(plan.weeks));
          setStartDate(plan.startDate);
          setActive(plan.active);
          setEntries(plan.entries.map(withKey));
          setOverrides(new Set(plan.overrides.map((o) => slot(o.week, o.weekday))));
        } else {
          // Neuer Plan wird automatisch aktiv, wenn noch keiner aktiv ist
          setActive(!list?.some((p) => p.active));
          setRecommendOpen(true);
        }
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  const weekCount = Math.max(1, Math.min(104, Number(weeks) || 1));
  const dayEntries = (week: number, weekday: number) => entries.filter((e) => e.week === week && e.weekday === weekday);
  const update = (key: number, patch: Partial<PlanEntry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  function move(entry: DraftEntry, dir: -1 | 1) {
    setEntries((list) => {
      const same = list.filter((e) => e.week === entry.week && e.weekday === entry.weekday);
      const i = same.findIndex((e) => e.key === entry.key);
      const other = same[i + dir];
      if (!other) return list;
      return list.map((e) => (e.key === entry.key ? other : e.key === other.key ? entry : e));
    });
  }

  function customizeWeek(week: number, weekday: number) {
    setOverrides((o) => new Set(o).add(slot(week, weekday)));
    // Muster des Tages als Ausgangspunkt übernehmen
    setEntries((list) => [
      ...list,
      ...list.filter((e) => e.week === 0 && e.weekday === weekday).map(({ id: _id, ...e }) => withKey({ ...e, week })),
    ]);
  }

  function resetWeek(week: number, weekday: number) {
    setOverrides((o) => {
      const n = new Set(o);
      n.delete(slot(week, weekday));
      return n;
    });
    setEntries((list) => list.filter((e) => !(e.week === week && e.weekday === weekday)));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name,
      weeks: weekCount,
      startDate,
      active,
      entries: entries
        .filter((en) => en.week <= weekCount)
        .map(({ key: _k, workoutName: _w, stretchingName: _s, activityName: _a, activityIcon: _i, ...en }) => en),
      overrides: [...overrides]
        .map((k) => k.split('-').map(Number))
        .filter(([w]) => w <= weekCount)
        .map(([week, weekday]) => ({ week, weekday })),
    };
    try {
      const saved = isNew ? await api.post<Plan>('/api/plans', body) : await api.put<Plan>(`/api/plans/${id}`, body);
      navigate(`/app/plan/${saved.id}/ansicht`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!loaded) return error ? <div className="error">{error}</div> : <p className="muted">Lade …</p>;

  const plan = { startDate, weeks: weekCount };
  const days =
    tab === 0
      ? [1, 2, 3, 4, 5, 6, 7].map((wd) => ({ wd, date: null as string | null }))
      : [1, 2, 3, 4, 5, 6, 7]
          .map((wd) => ({ wd, date: dateOf(plan, tab, wd) as string | null }))
          .sort((a, b) => a.date!.localeCompare(b.date!));

  return (
    <form onSubmit={save}>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>{isNew ? 'Neuer Trainingsplan' : 'Trainingsplan bearbeiten'}</h1>
        <button type="button" className="small" onClick={() => setRecommendOpen(true)}>
          ✨ Plan empfehlen
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <label>
          Name des Trainingsplans
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="z. B. Fit in 8 Wochen" />
        </label>
        <div className="grid-2">
          <label>
            Anzahl Wochen
            <input type="number" inputMode="numeric" min={1} max={104} value={weeks} onChange={(e) => setWeeks(e.target.value)} required />
          </label>
          <label>
            Start
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
        </div>
        <p className="muted small-text" style={{ margin: '10px 0' }}>
          Läuft vom {formatDay(startDate)} bis {formatDay(endDate(plan))}.
        </p>
        <label className="check-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Aktiver Plan (erscheint in der Übersicht unter „Heute“)
        </label>
      </div>

      <div className="week-tabs" role="tablist">
        <button type="button" className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>
          Wochenmuster
        </button>
        {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
          <button key={w} type="button" className={tab === w ? 'active' : ''} onClick={() => setTab(w)}>
            Woche {w}
          </button>
        ))}
      </div>
      <p className="muted small-text" style={{ marginTop: 0 }}>
        {tab === 0
          ? 'Das Wochenmuster gilt für jede Woche. Einzelne Tage kannst du in den Wochen-Reitern abweichend festlegen. Tage ohne Eintrag sind Ruhetage.'
          : `Woche ${tab}: Tage folgen dem Wochenmuster, außer du passt sie für diese Woche an.`}
      </p>

      <div className="week-days" style={{ marginBottom: 16 }}>
        {days.map(({ wd, date }) => {
          const overridden = tab > 0 && overrides.has(slot(tab, wd));
          const editable = tab === 0 || overridden;
          const list = dayEntries(editable ? tab : 0, wd);
          return (
            <div key={wd} className={`day-card ${overridden ? 'override' : ''}`}>
              <div className="day-head">
                <span>{WEEKDAYS[wd - 1]}</span>
                {date && <span className="muted small-text">{formatDay(date).slice(4)}</span>}
              </div>
              {list.length === 0 && (
                <div className="muted small-text" style={{ padding: '6px 0' }}>
                  😴 Ruhetag
                </div>
              )}
              {list.map((e, i) =>
                editable ? (
                  <EntryEditor
                    key={e.key}
                    entry={e}
                    first={i === 0}
                    last={i === list.length - 1}
                    workouts={workouts}
                    stretchings={stretchings}
                    activities={activities}
                    onChange={(patch) => update(e.key, patch)}
                    onMove={(dir) => move(e, dir)}
                    onRemove={() => setEntries((l) => l.filter((x) => x.key !== e.key))}
                  />
                ) : (
                  <div key={e.key} className="day-entry muted">
                    {entryIcon(e)} {entryTitle(e)}
                  </div>
                ),
              )}
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                {editable && (
                  <button type="button" className="small" onClick={() => setAddFor({ week: tab, weekday: wd })}>
                    + Hinzufügen
                  </button>
                )}
                {tab > 0 && !overridden && (
                  <button type="button" className="small ghost" onClick={() => customizeWeek(tab, wd)}>
                    ✎ Für diese Woche anpassen
                  </button>
                )}
                {overridden && (
                  <button type="button" className="small ghost" onClick={() => resetWeek(tab, wd)}>
                    ↺ Wie Muster
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="row">
        {!isNew && (
          <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
            Löschen
          </button>
        )}
        <span className="grow" />
        <button type="button" onClick={() => navigate(isNew ? '/app/plaene' : `/app/plan/${id}/ansicht`)}>
          Abbrechen
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </div>

      {addFor && (
        <AddEntryDialog
          workouts={workouts}
          stretchings={stretchings}
          activities={activities}
          onActivityCreated={(a) => setActivities((l) => [...l, a])}
          onClose={() => setAddFor(null)}
          onAdd={(e) => {
            setEntries((l) => [...l, withKey({ ...e, week: addFor.week, weekday: addFor.weekday })]);
            setAddFor(null);
          }}
        />
      )}
      {recommendOpen && (
        <RecommendDialog
          workouts={workouts}
          stretchings={stretchings}
          activities={activities}
          hasEntries={entries.length > 0}
          onClose={() => setRecommendOpen(false)}
          onApply={(pattern, suggestedName) => {
            setEntries(pattern.map(withKey));
            setOverrides(new Set());
            setTab(0);
            if (!name.trim()) setName(suggestedName);
            setRecommendOpen(false);
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Trainingsplan löschen?"
          text={`„${name}“ wird gelöscht. Der Fitness-Verlauf bleibt erhalten.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/plans/${id}`);
              navigate('/app/plaene');
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

function EntryEditor({
  entry,
  first,
  last,
  workouts,
  stretchings,
  activities,
  onChange,
  onMove,
  onRemove,
}: {
  entry: DraftEntry;
  first: boolean;
  last: boolean;
  workouts: Workout[];
  stretchings: Stretching[];
  activities: ActivityType[];
  onChange: (patch: Partial<PlanEntry>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <span style={{ fontSize: '1.2rem' }}>{entryIcon(entry)}</span>
        {entry.kind === 'workout' && (
          <select
            aria-label="Workout"
            value={entry.workoutId ?? ''}
            style={{ marginTop: 0, minHeight: 38, padding: '4px 8px' }}
            onChange={(e) => {
              const w = workouts.find((x) => x.id === Number(e.target.value));
              onChange({ workoutId: w?.id ?? null, workoutName: w?.name ?? null });
            }}
          >
            <option value="">Workout nach Wahl</option>
            {entry.workoutId && !workouts.some((w) => w.id === entry.workoutId) && (
              <option value={entry.workoutId}>{entry.workoutName ?? 'nicht mehr verfügbar'}</option>
            )}
            {workouts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        {entry.kind === 'stretching' && (
          <select
            aria-label="Stretching"
            value={entry.stretchingId ?? ''}
            style={{ marginTop: 0, minHeight: 38, padding: '4px 8px' }}
            onChange={(e) => {
              const s = stretchings.find((x) => x.id === Number(e.target.value));
              onChange({ stretchingId: s?.id ?? null, stretchingName: s?.name ?? null });
            }}
          >
            <option value="">Stretching nach Wahl</option>
            {stretchings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {entry.kind === 'activity' && (
          <select
            aria-label="Aktivität"
            value={entry.activityTypeId ?? ''}
            style={{ marginTop: 0, minHeight: 38, padding: '4px 8px' }}
            onChange={(e) => {
              const a = activities.find((x) => x.id === Number(e.target.value))!;
              onChange({ activityTypeId: a.id, activityName: a.name, activityIcon: a.icon });
            }}
          >
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="icon small" aria-label="Nach oben" disabled={first} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="icon small" aria-label="Nach unten" disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
        <button type="button" className="icon small ghost" aria-label="Entfernen" onClick={onRemove}>
          ✕
        </button>
      </div>
      {entry.kind === 'activity' && (
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'nowrap' }}>
          <select
            aria-label="Ziel"
            value={entry.targetType ?? ''}
            style={{ marginTop: 0, minHeight: 38, padding: '4px 8px', flex: 1.2 }}
            onChange={(e) => {
              const t = (e.target.value || null) as TargetType | null;
              onChange({ targetType: t, targetValue: t === 'duration' ? 30 : t === 'distance' ? 5 : null });
            }}
          >
            <option value="">Ohne Ziel</option>
            <option value="duration">Ziel: Dauer</option>
            <option value="distance">Ziel: Strecke</option>
          </select>
          {entry.targetType && (
            <>
              <input
                aria-label="Zielwert"
                type="number"
                inputMode="decimal"
                min={0}
                step={entry.targetType === 'distance' ? 0.1 : 1}
                value={entry.targetValue ?? ''}
                style={{ marginTop: 0, minHeight: 38, padding: '4px 8px', flex: 1 }}
                onChange={(e) => onChange({ targetValue: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <span className="muted small-text">{entry.targetType === 'duration' ? 'Min' : 'km'}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddEntryDialog({
  workouts,
  stretchings,
  activities,
  onActivityCreated,
  onAdd,
  onClose,
}: {
  workouts: Workout[];
  stretchings: Stretching[];
  activities: ActivityType[];
  onActivityCreated: (a: ActivityType) => void;
  onAdd: (e: PlanEntry) => void;
  onClose: () => void;
}) {
  const [newActivity, setNewActivity] = useState(false);
  const base: PlanEntry = {
    week: 0,
    weekday: 1,
    kind: 'activity',
    workoutId: null,
    stretchingId: null,
    activityTypeId: null,
    targetType: null,
    targetValue: null,
  };
  const addActivity = (a: ActivityType) =>
    onAdd({
      ...base,
      kind: 'activity',
      activityTypeId: a.id,
      activityName: a.name,
      activityIcon: a.icon,
      targetType: 'duration',
      targetValue: 30,
    });

  return (
    <Modal title="Training hinzufügen" onClose={onClose}>
      <h3>Aktivitäten</h3>
      <div className="choice-grid">
        {activities.map((a) => (
          <button key={a.id} type="button" onClick={() => addActivity(a)}>
            {a.icon} {a.name}
          </button>
        ))}
        <button type="button" className="ghost" onClick={() => setNewActivity(true)}>
          + Eigene Aktivität
        </button>
      </div>
      {newActivity && (
        <ActivityForm
          activity={null}
          onCancel={() => setNewActivity(false)}
          onSaved={(a) => {
            onActivityCreated(a);
            addActivity(a);
          }}
        />
      )}
      <h3>Workout</h3>
      <div className="choice-grid">
        <button type="button" onClick={() => onAdd({ ...base, kind: 'workout' })}>
          🏋️ Nach Wahl
        </button>
        {workouts.map((w) => (
          <button key={w.id} type="button" onClick={() => onAdd({ ...base, kind: 'workout', workoutId: w.id, workoutName: w.name })}>
            🏋️ {w.name}
          </button>
        ))}
      </div>
      <h3>Stretching</h3>
      <div className="choice-grid">
        <button type="button" onClick={() => onAdd({ ...base, kind: 'stretching' })}>
          🧘 Nach Wahl
        </button>
        {stretchings.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onAdd({ ...base, kind: 'stretching', stretchingId: s.id, stretchingName: s.name })}
          >
            🧘 {s.name}
          </button>
        ))}
      </div>
      <div className="row end">
        <button type="button" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </Modal>
  );
}

function RecommendDialog({
  workouts,
  stretchings,
  activities,
  hasEntries,
  onApply,
  onClose,
}: {
  workouts: Workout[];
  stretchings: Stretching[];
  activities: ActivityType[];
  hasEntries: boolean;
  onApply: (pattern: PlanEntry[], suggestedName: string) => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState(3);
  const [focus, setFocus] = useState<Focus>('ausgewogen');
  const defaultRun = activities.find((a) => a.name.toLowerCase() === 'laufen') ?? activities[0] ?? null;
  const [runId, setRunId] = useState<number | null>(defaultRun?.id ?? null);
  const [runMinutes, setRunMinutes] = useState(String(defaultRunMinutes('ausgewogen')));
  const usable = <T extends { items: unknown[] }>(l: T[]) => l.filter((x) => x.items.length > 0);

  function apply() {
    const run = activities.find((a) => a.id === runId) ?? null;
    const pattern = recommendPattern({
      daysPerWeek: days,
      focus,
      workouts: usable(workouts),
      stretchings: usable(stretchings),
      run,
      runMinutes: Number(runMinutes) || defaultRunMinutes(focus),
    });
    const label = FOCUS_OPTIONS.find((f) => f.id === focus)!.label;
    onApply(pattern, `${label} – ${days}× pro Woche`);
  }

  return (
    <Modal title="✨ Plan empfehlen" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Die App erstellt ein Wochenmuster aus deinen Workouts, Stretchings und Aktivitäten. Danach kannst du alles anpassen.
      </p>
      <div className="muted small-text" style={{ marginBottom: 6 }}>
        Trainingstage pro Woche
      </div>
      <div className="segmented" style={{ marginBottom: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} type="button" className={days === n ? 'active' : ''} onClick={() => setDays(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="muted small-text" style={{ marginTop: 0 }}>
        {TRAINING_DAYS[days].map((d) => WEEKDAYS[d - 1]).join(', ')}
      </p>
      <div className="muted small-text" style={{ marginBottom: 6 }}>
        Schwerpunkt
      </div>
      <div className="list" style={{ marginBottom: 14 }}>
        {FOCUS_OPTIONS.map((f) => (
          <div
            key={f.id}
            className={`list-item clickable ${focus === f.id ? 'selected' : ''}`}
            style={{ minHeight: 0 }}
            onClick={() => {
              setFocus(f.id);
              setRunMinutes(String(defaultRunMinutes(f.id)));
            }}
          >
            <div className="li-main">
              <div className="li-title">{f.label}</div>
              <div className="li-sub">{f.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <label>
          Ausdauer-Aktivität
          <select value={runId ?? ''} onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Keine</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dauer <span className="hint">(Minuten)</span>
          <input type="number" inputMode="numeric" min={5} value={runMinutes} onChange={(e) => setRunMinutes(e.target.value)} disabled={!runId} />
        </label>
      </div>
      {usable(workouts).length === 0 && (
        <div className="notice">Du hast noch keine Workouts – Workout-Tage werden als „nach Wahl“ eingeplant.</div>
      )}
      {hasEntries && <div className="notice">Das bisherige Wochenmuster und alle Abweichungen werden ersetzt.</div>}
      <div className="row end">
        <button type="button" onClick={onClose}>
          {hasEntries ? 'Abbrechen' : 'Selbst zusammenstellen'}
        </button>
        <button type="button" className="primary" onClick={apply}>
          Vorschlag übernehmen
        </button>
      </div>
    </Modal>
  );
}
