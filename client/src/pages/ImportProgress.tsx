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
      setPreview(await api.post('/api/import/progress/preview', { data: json }));
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
      setResult(await api.post('/api/import/progress', { data }));
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
