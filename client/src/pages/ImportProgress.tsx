import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { readJsonFile } from './importFile';

export default function ImportProgress() {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState<string | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ total: number; duplicates: number; new: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const json = await readJsonFile(file);
      const sum = { total: 0, duplicates: 0, new: 0 };
      for (const batch of batches(json)) {
        const p = await api.post<typeof sum>('/api/import/progress/preview', { data: batch });
        sum.total += p.total;
        sum.duplicates += p.duplicates;
        sum.new += p.new;
      }
      setPreview(sum);
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setError(null);
    try {
      const sum = { imported: 0, skipped: 0 };
      for (const batch of batches(data)) {
        const r = await api.post<typeof sum>('/api/import/progress', { data: batch });
        sum.imported += r.imported;
        sum.skipped += r.skipped;
      }
      setResult(sum);
      setPreview(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Import Fortschritt</h1>
      <p className="muted">
        Wähle eine JSON-Datei, die über „Export Fortschritt“ erstellt wurde. Bereits vorhandene Einträge werden
        übersprungen.
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

      {preview && (
        <div className="card">
          <h2>Vorschau</h2>
          <p>
            Die Datei enthält <strong>{preview.total}</strong> Einträge: <strong>{preview.new}</strong> neu,{' '}
            <strong>{preview.duplicates}</strong> bereits vorhanden (werden übersprungen).
          </p>
          <div className="row end">
            <button onClick={() => setPreview(null)}>Abbrechen</button>
            <button className="primary" disabled={busy || preview.new === 0} onClick={doImport}>
              {busy ? 'Importiere …' : `${preview.new} Einträge importieren`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2>Import abgeschlossen ✅</h2>
          <p>
            {result.imported} importiert, {result.skipped} übersprungen.
          </p>
          <button className="primary" onClick={() => navigate('/app/verlauf')}>
            Zum Verlauf
          </button>
        </div>
      )}
    </div>
  );
}

const BATCH = 100;

/** Teilt die Datei in Pakete zu je 100 Einträgen; jedes Paket ist für sich eine gültige Datei. */
function batches(json: unknown): unknown[] {
  const data = json as { executions?: unknown };
  if (!data || typeof data !== 'object' || !Array.isArray(data.executions) || data.executions.length <= BATCH) {
    return [json];
  }
  const list = data.executions;
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) out.push({ ...data, executions: list.slice(i, i + BATCH) });
  return out;
}
