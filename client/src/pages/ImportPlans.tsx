import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { readJsonFile } from './importFile';

type Decision = 'overwrite' | 'copy';
type Group = 'exercises' | 'stretchExercises' | 'workouts' | 'stretchings';

interface PreviewEntry {
  name: string;
  conflict: boolean;
  itemCount?: number;
}
type Preview = Record<Group, PreviewEntry[]>;

const groupTitles: Record<Group, string> = {
  workouts: 'Workouts',
  stretchings: 'Stretchings',
  exercises: 'Übungen',
  stretchExercises: 'Stretching-Übungen',
};
const groupOrder: Group[] = ['workouts', 'stretchings', 'exercises', 'stretchExercises'];

export default function ImportPlans() {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<Group, Record<string, Decision>>>({
    exercises: {},
    stretchExercises: {},
    workouts: {},
    stretchings: {},
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; overwritten: number } | null>(null);

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const json = await readJsonFile(file);
      const p = await api.post<Preview>('/api/import/plans/preview', { data: json });
      setData(json);
      setPreview(p);
      const d = { exercises: {}, stretchExercises: {}, workouts: {}, stretchings: {} } as Record<Group, Record<string, Decision>>;
      for (const g of groupOrder) for (const e of p[g]) if (e.conflict) d[g][e.name] = 'copy';
      setDecisions(d);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setAll = (value: Decision) =>
    setDecisions((d) => {
      const copy = { ...d };
      for (const g of groupOrder) copy[g] = Object.fromEntries(Object.keys(d[g]).map((k) => [k, value]));
      return copy;
    });

  async function doImport() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post('/api/import/plans', { data, decisions }));
      setPreview(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const conflictCount = preview ? groupOrder.reduce((n, g) => n + preview[g].filter((e) => e.conflict).length, 0) : 0;
  const total = preview ? groupOrder.reduce((n, g) => n + preview[g].length, 0) : 0;

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Import Workouts &amp; Stretching</h1>
      <p className="muted">
        Wähle eine JSON-Datei, die über „Export Workouts &amp; Stretching“ erstellt wurde. Vor dem Import siehst du eine
        Vorschau.
      </p>
      {error && <div className="error">{error}</div>}
      <label className="btn" style={{ display: 'inline-flex', marginBottom: 16 }}>
        📂 Datei auswählen
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
      </label>
      {fileName && <span className="muted" style={{ marginLeft: 12 }}>{fileName}</span>}

      {result && (
        <div className="card">
          <h2>Import abgeschlossen ✅</h2>
          <p>
            {result.created} neu angelegt, {result.overwritten} überschrieben.
          </p>
          <button className="primary" onClick={() => navigate('/app')}>
            Zur Übersicht
          </button>
        </div>
      )}

      {preview && (
        <div className="card">
          <h2>Vorschau</h2>
          {total === 0 && <p className="muted">Die Datei enthält keine Einträge.</p>}
          {conflictCount > 0 && (
            <div className="notice">
              {conflictCount} {conflictCount === 1 ? 'Eintrag gibt' : 'Einträge gibt'} es bereits mit gleichem Namen. Lege
              fest, ob sie überschrieben oder als Kopie angelegt werden sollen.
              <div className="row" style={{ marginTop: 8 }}>
                <button className="small" onClick={() => setAll('overwrite')}>
                  Alle überschreiben
                </button>
                <button className="small" onClick={() => setAll('copy')}>
                  Alle als Kopie
                </button>
              </div>
            </div>
          )}
          {groupOrder.map(
            (g) =>
              preview[g].length > 0 && (
                <div key={g} className="import-group">
                  <h3>
                    {groupTitles[g]} ({preview[g].length})
                  </h3>
                  {preview[g].map((e, i) => (
                    <div key={`${e.name}-${i}`} className="import-row">
                      <span className="name">
                        {e.name}
                        {e.itemCount !== undefined && <span className="muted small-text"> · {e.itemCount} Übungen</span>}
                      </span>
                      {e.conflict ? (
                        <div className="segmented">
                          <button
                            className={decisions[g][e.name] === 'overwrite' ? 'active' : ''}
                            onClick={() => setDecisions((d) => ({ ...d, [g]: { ...d[g], [e.name]: 'overwrite' } }))}
                          >
                            Überschreiben
                          </button>
                          <button
                            className={decisions[g][e.name] === 'copy' ? 'active' : ''}
                            onClick={() => setDecisions((d) => ({ ...d, [g]: { ...d[g], [e.name]: 'copy' } }))}
                          >
                            Als Kopie
                          </button>
                        </div>
                      ) : (
                        <span className="badge">neu</span>
                      )}
                    </div>
                  ))}
                </div>
              ),
          )}
          <div className="row end">
            <button onClick={() => setPreview(null)}>Abbrechen</button>
            <button className="primary" disabled={busy || total === 0} onClick={doImport}>
              {busy ? 'Importiere …' : 'Importieren'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
