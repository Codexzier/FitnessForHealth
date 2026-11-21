import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import type { User } from '../types';

export default function UserSelect() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get<User[]>('/api/users')
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="welcome">
      <div className="logo">💪 FitnessForHealth</div>
      <p className="muted">Wer trainiert heute?</p>
      {error && <div className="error">{error}</div>}
      <div className="user-grid">
        {users?.map((u) => (
          <button key={u.id} className="user-card" onClick={() => setSelected(u)}>
            <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
            {u.name}
          </button>
        ))}
        <button className="user-card" onClick={() => setCreating(true)}>
          <span className="avatar">+</span>
          Benutzer hinzufügen
        </button>
      </div>
      {users?.length === 0 && <p className="muted">Noch keine Benutzer vorhanden. Lege den ersten Benutzer an.</p>}
      {selected && <LoginDialog user={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function LoginDialog({ user, onClose }: { user: User; onClose: () => void }) {
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
      setUser(await api.post<User>('/api/login', { userId: user.id, password }));
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Anmelden als ${user.name}`} onClose={onClose}>
      <form onSubmit={submit}>
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
        <div className="row end">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Anmelden
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setUser(await api.post<User>('/api/users', { name, password }));
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Benutzer hinzufügen" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required maxLength={120} />
        </label>
        <label>
          Passwort <span className="hint">(mindestens 4 Zeichen)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={4}
          />
        </label>
        <label>
          Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            required
          />
        </label>
        <div className="row end">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary" disabled={busy}>
            Anlegen
          </button>
        </div>
      </form>
    </Modal>
  );
}
