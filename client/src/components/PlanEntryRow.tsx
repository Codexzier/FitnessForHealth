import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { entryIcon, entryTitle, isDone, targetText, todayISO } from '../plan/schedule';
import type { Plan, PlanEntry, Rating, Stretching, Workout } from '../types';
import { Modal } from './Modal';

export function planRunUrl(kind: 'workout' | 'stretching', id: number, plan: Plan, entry: PlanEntry, date: string) {
  return `/app/run/${kind}/${id}?plan=${plan.id}&entry=${entry.id}&date=${date}`;
}

/**
 * Ein Eintrag an einem Trainingstag: grüner Haken, wenn erledigt; sonst „Bestätigen“ (Aktivität)
 * bzw. „Starten“ (Workout/Stretching). Zukünftige Tage zeigen nur den Eintrag.
 */
export function PlanEntryRow({
  plan,
  entry,
  date,
  onPlanChange,
  compact,
}: {
  plan: Plan;
  entry: PlanEntry;
  date: string;
  onPlanChange: (p: Plan) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = isDone(plan, entry.id, date);
  const today = todayISO();
  const actionable = date <= today;
  const missed = !done && date < today;
  const target = targetText(entry);

  const start = (kind: 'workout' | 'stretching', id: number) => navigate(planRunUrl(kind, id, plan, entry, date));

  async function undo() {
    try {
      onPlanChange(await api.del<Plan>(`/api/plans/${plan.id}/completions/${entry.id}/${date}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={compact ? `day-entry ${done ? 'done' : ''}` : `entry-row ${done ? 'done' : ''}`}>
      {done ? (
        <span className="done-check" title="Erledigt" aria-label="Erledigt">
          ✓
        </span>
      ) : (
        <span className={`open-dot ${missed ? 'missed-dot' : ''}`} aria-label={missed ? 'Verpasst' : 'Offen'} />
      )}
      <div className={compact ? 'grow' : 'entry-main'}>
        <div className="entry-title">
          {entryIcon(entry)} {entryTitle(entry)}
        </div>
        {(target || error) && (
          <div className="muted small-text">
            {target && `Ziel: ${target}`}
            {error && <span style={{ color: 'var(--danger)' }}> {error}</span>}
          </div>
        )}
      </div>
      {actionable && !done && entry.kind === 'activity' && (
        <button className={`primary ${compact ? 'small' : ''}`} onClick={() => setConfirmOpen(true)}>
          ✓ Bestätigen
        </button>
      )}
      {actionable && !done && entry.kind !== 'activity' && (
        <button
          className={`primary ${compact ? 'small' : ''}`}
          onClick={() => {
            const id = entry.kind === 'workout' ? entry.workoutId : entry.stretchingId;
            if (id) start(entry.kind as 'workout' | 'stretching', id);
            else setChooseOpen(true);
          }}
        >
          ▶ Starten
        </button>
      )}
      {done && (
        <button className="small ghost" onClick={undo} title="Haken entfernen">
          Rückgängig
        </button>
      )}
      {confirmOpen && (
        <ConfirmActivityDialog
          plan={plan}
          entry={entry}
          date={date}
          onClose={() => setConfirmOpen(false)}
          onDone={(p) => {
            setConfirmOpen(false);
            onPlanChange(p);
          }}
        />
      )}
      {chooseOpen && (
        <ChooseDialog
          kind={entry.kind as 'workout' | 'stretching'}
          onClose={() => setChooseOpen(false)}
          onPick={(id) => start(entry.kind as 'workout' | 'stretching', id)}
        />
      )}
    </div>
  );
}

function ConfirmActivityDialog({
  plan,
  entry,
  date,
  onClose,
  onDone,
}: {
  plan: Plan;
  entry: PlanEntry;
  date: string;
  onClose: () => void;
  onDone: (p: Plan) => void;
}) {
  const [minutes, setMinutes] = useState(entry.targetType === 'duration' ? String(entry.targetValue ?? '') : '');
  const [km, setKm] = useState(entry.targetType === 'distance' ? String(entry.targetValue ?? '').replace('.', ',') : '');
  const [rating, setRating] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const distance = km.trim() ? Number(km.replace(',', '.')) : null;
    if (distance !== null && Number.isNaN(distance)) {
      setError('Bitte eine gültige Strecke angeben.');
      return;
    }
    setBusy(true);
    try {
      onDone(
        await api.post<Plan>(`/api/plans/${plan.id}/completions`, {
          entryId: entry.id,
          date,
          startedAt: date === todayISO() ? new Date().toISOString() : undefined,
          durationMin: minutes.trim() ? Number(minutes) : null,
          distanceKm: distance,
          rating,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`${entryIcon(entry)} ${entryTitle(entry)} bestätigen`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          Trage optional ein, wie lange und wie weit du unterwegs warst. Der Eintrag erscheint im Fitness-Verlauf.
        </p>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <label>
            Dauer <span className="hint">(Minuten)</span>
            <input type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label>
            Strecke <span className="hint">(km)</span>
            <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="z. B. 5,2" />
          </label>
        </div>
        <div className="muted small-text" style={{ marginBottom: 6 }}>
          Wie lief es? (optional)
        </div>
        <div className="segmented" style={{ marginBottom: 16 }}>
          {(
            [
              ['bad', 'Schlecht'],
              ['medium', 'Mittel'],
              ['good', 'Gut'],
            ] as [Rating, string][]
          ).map(([r, label]) => (
            <button key={r} type="button" className={rating === r ? 'active' : ''} onClick={() => setRating(rating === r ? null : r)}>
              {label}
            </button>
          ))}
        </div>
        <div className="row end">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={busy}>
            ✓ Bestätigen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Auswahl bei Einträgen „nach Wahl“ */
function ChooseDialog({
  kind,
  onClose,
  onPick,
}: {
  kind: 'workout' | 'stretching';
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  const [items, setItems] = useState<(Workout | Stretching)[] | null>(null);
  useEffect(() => {
    api.get<(Workout | Stretching)[]>(kind === 'workout' ? '/api/workouts' : '/api/stretchings').then(setItems);
  }, [kind]);
  return (
    <Modal title={kind === 'workout' ? 'Welches Workout?' : 'Welches Stretching?'} onClose={onClose}>
      {items?.length === 0 && <p className="muted">Noch nichts vorhanden.</p>}
      <div className="list" style={{ marginBottom: 14 }}>
        {items
          ?.filter((i) => i.items.length > 0)
          .map((i) => (
            <div key={i.id} className="list-item clickable" onClick={() => onPick(i.id)}>
              <div className="li-main">
                <div className="li-title">{i.name}</div>
                <div className="li-sub">{i.items.length} Übungen</div>
              </div>
              <span className="muted">▶</span>
            </div>
          ))}
      </div>
      <div className="row end">
        <button onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}
