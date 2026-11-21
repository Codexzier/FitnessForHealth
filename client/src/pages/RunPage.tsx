import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { beepFinish, beepStart, beepTick, unlockAudio } from '../audio';
import { ConfirmDialog } from '../components/Modal';
import { formatDuration, formatMinutes } from '../format';
import {
  activeMs,
  buildStretchingSteps,
  buildWorkoutSteps,
  cueFor,
  estimateDuration,
  next as nextStep,
  pause,
  remainingMs,
  resume,
  skip,
  startRun,
  stepElapsedMs,
  tick,
  upcomingExercise,
  type ExerciseInfo,
  type RunState,
  type Step,
} from '../timer/engine';
import { toStretchingPlan, toWorkoutPlan } from '../timer/plans';
import type { Kind, Rating, Stretching, Workout } from '../types';
import { WakeLockGuard, wakeLockSupported, type WakeLockMode } from '../wakeLock';

interface Loaded {
  title: string;
  kind: Kind;
  steps: Step[];
}

export default function RunPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<Loaded> => {
      if (kind === 'workout') {
        const w = await api.get<Workout>(`/api/workouts/${id}`);
        return { title: w.name, kind: 'workout', steps: buildWorkoutSteps(toWorkoutPlan(w)) };
      }
      const s = await api.get<Stretching>(`/api/stretchings/${id}`);
      return { title: s.name, kind: 'stretching', steps: buildStretchingSteps(toStretchingPlan(s)) };
    };
    load()
      .then((d) => {
        // Bilder vorab laden, damit beim Wechsel nichts flackert
        new Set(d.steps.map((s) => s.exercise.image).filter(Boolean)).forEach((src) => {
          const img = new Image();
          img.src = src!;
        });
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [kind, id]);

  if (error)
    return (
      <div className="start-screen">
        <div className="error">{error}</div>
        <button onClick={() => navigate('/app')}>Zur Übersicht</button>
      </div>
    );
  if (!data) return <div className="start-screen muted">Lade …</div>;
  return <Runner data={data} />;
}

function Runner({ data }: { data: Loaded }) {
  const navigate = useNavigate();
  const { steps, title, kind } = data;
  const [run, setRun] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedIso = useRef('');
  const lastCue = useRef<string | null>(null);
  const wake = useRef(new WakeLockGuard());
  const [wakeMode, setWakeMode] = useState<WakeLockMode | null>(null);
  const [wakeHintOpen, setWakeHintOpen] = useState(true);
  const [confirmAbort, setConfirmAbort] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pausedByDialog = useRef(false);

  const estimate = useMemo(() => estimateDuration(steps), [steps]);
  const finished = run?.finishedAt != null;

  const apply = useCallback((fn: (r: RunState, t: number) => RunState) => {
    if (!runRef.current) return;
    const t = Date.now();
    const nextState = fn(runRef.current, t);
    runRef.current = nextState;
    setRun(nextState);
    setNow(t);
  }, []);

  // Haupt-Takt: Zustand wird aus Zeitstempeln berechnet, nicht hochgezählt
  useEffect(() => {
    if (!run || finished) return;
    const handle = window.setInterval(() => {
      const t = Date.now();
      const r = runRef.current;
      if (!r) return;
      const nextState = tick(r, steps, t);
      if (nextState !== r) {
        runRef.current = nextState;
        setRun(nextState);
      }
      setNow(t);
      const cue = cueFor(nextState, steps, t);
      if (cue && cue.key !== lastCue.current) {
        lastCue.current = cue.key;
        if (cue.kind === 'start') beepStart();
        else beepTick();
      }
    }, 100);
    return () => window.clearInterval(handle);
  }, [run !== null, finished, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (finished) {
      beepFinish();
      wake.current.disable();
    }
  }, [finished]);

  useEffect(() => {
    const guard = wake.current;
    return () => guard.disable();
  }, []);

  // Warnung beim Schließen/Neuladen während einer laufenden Einheit
  useEffect(() => {
    if (!run || finished) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [run !== null, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    unlockAudio(); // muss direkt im Tipp-Handler passieren (iOS/Android)
    void wake.current.enable().then(setWakeMode);
    const t = Date.now();
    startedIso.current = new Date(t).toISOString();
    lastCue.current = null;
    const r = startRun(steps, t);
    runRef.current = r;
    setRun(r);
    setNow(t);
    // Der erste Countdown-Piepton sofort
    const cue = cueFor(r, steps, t);
    if (cue) {
      lastCue.current = cue.key;
      beepTick();
    }
  }

  async function save(status: 'completed' | 'aborted', rating: Rating | null) {
    const r = runRef.current;
    if (!r) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.post('/api/executions', {
        kind,
        name: title,
        startedAt: startedIso.current,
        durationSec: Math.round(activeMs(r, Date.now()) / 1000),
        rating,
        status,
      });
      wake.current.disable();
      navigate('/app');
    } catch (err) {
      setSaveError((err as Error).message);
      setSaving(false);
    }
  }

  // ---------- Startbildschirm ----------
  if (!run) {
    return (
      <div className="start-screen">
        <span className={`badge ${kind === 'stretching' ? 'stretch' : ''}`}>
          {kind === 'workout' ? 'Workout' : 'Stretching'}
        </span>
        <h1 style={{ marginTop: 8 }}>{title}</h1>
        <p className="muted">
          ca. {formatMinutes(estimate.seconds)}
          {estimate.hasReps && ' zzgl. Wiederholungs-Übungen'}
        </p>
        <button className="primary big-start" onClick={start} disabled={steps.length === 0}>
          ▶ Start
        </button>
        {steps.length === 0 && <div className="notice">Diese Einheit enthält noch keine Übungen.</div>}
        <div className="notice">🔊 Ton einschalten: Pieptöne zählen die letzten 5 Sekunden herunter.</div>
        {!wakeLockSupported() && (
          <div className="notice">
            ⚠️ Dein Browser kann die automatische Bildschirmsperre hier nicht zuverlässig verhindern (die Screen Wake
            Lock API ist nicht verfügbar – meist, weil die Seite über http:// statt https:// geöffnet ist). Es wird eine
            Ausweichlösung versucht. Stelle zur Sicherheit die automatische Sperre in den Geräteeinstellungen ab.
          </div>
        )}
        <button className="ghost" onClick={() => navigate('/app')}>
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  // ---------- Abschluss ----------
  if (finished) {
    return (
      <div className="finish-screen">
        <div style={{ fontSize: '3rem' }}>🎉</div>
        <h1>Geschafft!</h1>
        <p className="muted">{title}</p>
        <div className="muted">Gesamtdauer</div>
        <div className="total">{formatDuration(activeMs(run, now) / 1000)}</div>
        <h2>Wie lief es?</h2>
        {saveError && <div className="error">{saveError}</div>}
        <div className="rating-buttons">
          <button className="bad" disabled={saving} onClick={() => save('completed', 'bad')}>
            😣 Schlecht
          </button>
          <button className="medium" disabled={saving} onClick={() => save('completed', 'medium')}>
            😐 Mittel
          </button>
          <button className="good" disabled={saving} onClick={() => save('completed', 'good')}>
            😄 Gut
          </button>
        </div>
      </div>
    );
  }

  // ---------- Durchführung ----------
  const step = steps[run.index];
  const ex = step.exercise;
  const rem = remainingMs(run, steps, now);
  const paused = run.pausedAt !== null;
  const upcoming = upcomingExercise(steps, run.index);
  const isReps = step.phase === 'work' && step.duration === 0;

  const phaseLabel =
    step.phase === 'countdown'
      ? 'Gleich geht’s los'
      : step.phase === 'rest'
        ? step.restKind === 'round'
          ? 'Rundenpause'
          : 'Pause'
        : kind === 'stretching'
          ? 'Dehnen'
          : 'Los!';

  const position =
    kind === 'workout'
      ? `Runde ${ex.round}/${ex.totalRounds} · Satz ${ex.set}/${ex.totalSets}`
      : `Übung ${ex.set}/${ex.totalSets}`;

  const progress = rem !== null && step.duration > 0 ? 1 - rem / (step.duration * 1000) : null;

  return (
    <div className={`runner ${step.phase}`}>
      <div className="runner-head">
        <div className="r-title">{title}</div>
        <div className="r-meta">⏱ {formatDuration(activeMs(run, now) / 1000)}</div>
      </div>

      <div className="runner-body">
        <div className="runner-image">
          {ex.image ? <img src={ex.image} alt={ex.name} /> : <div className="placeholder">{kind === 'workout' ? '🏋️' : '🧘'}</div>}
          {paused && <div className="paused-overlay">PAUSIERT</div>}
        </div>
        <div className="runner-side">
          <div className="runner-info">
            <span className="phase-label">{phaseLabel}</span>
            <div className="exercise-name">
              {step.phase === 'countdown' ? `${ex.name}` : step.phase === 'rest' ? `Als Nächstes: ${ex.name}` : ex.name}
            </div>
            <div className="round-set">{position}</div>
            {isReps ? (
              <div className="big-timer">
                {ex.value}
                <span className="unit">Wdh.</span>
              </div>
            ) : (
              <div className="big-timer">{rem !== null ? formatSeconds(rem) : ''}</div>
            )}
            {isReps && (
              <div className="muted small-text">seit {formatDuration(stepElapsedMs(run, now) / 1000)} · Tippe auf „Next“, wenn du fertig bist</div>
            )}
          </div>
          {progress !== null && (
            <div className="progress-bar" aria-hidden>
              <div style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
          <NextPreview exercise={upcoming} kind={kind} />
        </div>
      </div>

      {wakeMode === 'none' && wakeHintOpen && (
        <div className="notice" style={{ margin: 0 }} onClick={() => setWakeHintOpen(false)}>
          ⚠️ Die Bildschirmsperre kann nicht verhindert werden. Bitte die automatische Sperre abstellen. (Tippen zum
          Ausblenden)
        </div>
      )}

      <div className="runner-controls">
        {isReps && (
          <button className="primary next-btn" onClick={() => apply((r, t) => nextStep(resume(r, t), steps, t))}>
            Next ›
          </button>
        )}
        <button onClick={() => apply((r, t) => (paused ? resume(r, t) : pause(r, t)))}>
          {paused ? '▶ Fortsetzen' : '❚❚ Pause'}
        </button>
        <button onClick={() => apply((r, t) => skip(r, steps, t))}>
          ⏭ {step.phase === 'rest' ? 'Pause überspringen' : 'Überspringen'}
        </button>
        <button
          className="danger"
          onClick={() => {
            pausedByDialog.current = !paused;
            if (!paused) apply((r, t) => pause(r, t));
            setConfirmAbort(true);
          }}
        >
          ✕ Abbrechen
        </button>
      </div>

      {confirmAbort && (
        <ConfirmDialog
          title="Einheit abbrechen?"
          text="Die Einheit wird als „abgebrochen“ im Verlauf gespeichert."
          confirmLabel="Ja, abbrechen"
          cancelLabel="Weitermachen"
          danger
          onCancel={() => {
            setConfirmAbort(false);
            if (pausedByDialog.current) apply((r, t) => resume(r, t));
          }}
          onConfirm={() => {
            setConfirmAbort(false);
            void save('aborted', null);
          }}
        />
      )}
      {saveError && <div className="error">{saveError}</div>}
    </div>
  );
}

function formatSeconds(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  return sec >= 60 ? formatDuration(sec) : String(sec);
}

function NextPreview({ exercise, kind }: { exercise: ExerciseInfo | null; kind: Kind }) {
  if (!exercise) {
    return (
      <div className="next-preview">
        <span className="muted">Danach:</span>
        <strong>Ende 🎉</strong>
      </div>
    );
  }
  return (
    <div className="next-preview">
      {exercise.image ? <img className="thumb" src={exercise.image} alt="" /> : <div className="thumb">{kind === 'workout' ? '🏋️' : '🧘'}</div>}
      <div className="li-main">
        <div className="muted small-text">Danach</div>
        <div className="li-title">
          {exercise.name}{' '}
          <span className="muted small-text">
            {exercise.mode === 'time' ? `${exercise.value} s` : `${exercise.value} Wdh.`}
            {kind === 'workout' && exercise.totalSets > 1 && ` · Satz ${exercise.set}/${exercise.totalSets}`}
          </span>
        </div>
      </div>
    </div>
  );
}
