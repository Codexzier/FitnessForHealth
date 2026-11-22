import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Profile } from '../types';

/** Anmeldung der ESP32-Variante: nur ein Passwort, kein Benutzer zur Auswahl. */
export default function EspLogin() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await api.post<Profile>('/api/login', { userId: 1, password }));
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="welcome" style={{ maxWidth: 420 }}>
      <div className="logo">💪 FitnessForHealth</div>
      <p className="muted">Bitte Passwort eingeben.</p>
      <form className="card" onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <label>
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        <button type="submit" className="primary" style={{ width: '100%' }} disabled={busy}>
          Anmelden
        </button>
      </form>
    </div>
  );
}
