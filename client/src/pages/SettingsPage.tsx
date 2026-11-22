import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { avatarUrl } from '../components/Avatar';
import { ImagePicker, type ImageValue } from '../components/ImagePicker';
import { ConfirmDialog } from '../components/Modal';
import { COLOR_MODES, THEMES } from '../theme';
import type { ActivityType, ColorMode, Profile, ThemeName } from '../types';

export default function SettingsPage() {
  return (
    <div className="settings">
      <h1 style={{ margin: 0 }}>Einstellungen</h1>
      <ProfileSection />
      <AppearanceSection />
      <PasswordSection />
      <ActivitiesSection />
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user!.name);
  const [image, setImage] = useState<ImageValue>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      let profile = user!;
      if (name.trim() !== user!.name) profile = await api.put<Profile>('/api/me', { name });
      if (image.imageData || image.removeImage) profile = await api.put<Profile>('/api/me/avatar', image);
      setUser(profile);
      setImage({});
      setMsg({ ok: true, text: 'Profil gespeichert.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Profil</h2>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
      <div className="muted small-text" style={{ marginBottom: 6 }}>
        Profilbild (erscheint in der Benutzerauswahl)
      </div>
      <ImagePicker current={user!.avatar} value={image} onChange={setImage} icon="👤" urlFor={avatarUrl} />
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </label>
      <div className="row end">
        <button type="submit" className="primary" disabled={busy}>
          Profil speichern
        </button>
      </div>
    </form>
  );
}

function AppearanceSection() {
  const { user, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { theme?: ThemeName; colorMode?: ColorMode }) {
    const previous = user!;
    setUser({ ...previous, ...patch }); // sofort anzeigen
    try {
      setUser(await api.put<Profile>('/api/me', patch));
      setError(null);
    } catch (err) {
      setUser(previous);
      setError((err as Error).message);
    }
  }

  return (
    <div className="card">
      <h2>Darstellung</h2>
      {error && <div className="error">{error}</div>}
      <div className="muted small-text" style={{ marginBottom: 8 }}>
        Farbschema
      </div>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`theme-option ${user!.theme === t.id ? 'active' : ''}`}
            onClick={() => save({ theme: t.id })}
            aria-pressed={user!.theme === t.id}
          >
            <span className="swatches">
              <span style={{ background: t.colors[0] }} />
              <span style={{ background: t.colors[1] }} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
      <div className="muted small-text" style={{ margin: '16px 0 8px' }}>
        Hell / Dunkel
      </div>
      <div className="segmented" style={{ maxWidth: 420 }}>
        {COLOR_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={user!.colorMode === m.id ? 'active' : ''}
            onClick={() => save({ colorMode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== repeat) {
      setMsg({ ok: false, text: 'Die neuen Passwörter stimmen nicht überein.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/api/me/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      setMsg({ ok: true, text: 'Passwort geändert. Andere angemeldete Geräte wurden abgemeldet.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Passwort ändern</h2>
      {msg && <div className={msg.ok ? 'notice' : 'error'}>{msg.text}</div>}
      <label>
        Aktuelles Passwort
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label>
        Neues Passwort <span className="hint">(mindestens 4 Zeichen)</span>
        <input type="password" autoComplete="new-password" minLength={4} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label>
        Neues Passwort wiederholen
        <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </label>
      <div className="row end">
        <button type="submit" className="primary" disabled={busy}>
          Passwort ändern
        </button>
      </div>
    </form>
  );
}

const ICONS = ['🏃', '🚴', '🏊', '🚶', '🥾', '⛷️', '🧗', '🏸', '⚽', '🛶', '🧘', '😴'];

function ActivitiesSection() {
  const [items, setItems] = useState<ActivityType[]>([]);
  const [editing, setEditing] = useState<ActivityType | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<ActivityType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ActivityType[]>('/api/activity-types')
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 className="grow" style={{ margin: 0 }}>
          Eigene Aktivitäten
        </h2>
        <button type="button" className="small primary" onClick={() => setEditing('new')}>
          + Neu
        </button>
      </div>
      <p className="muted small-text" style={{ marginTop: 0 }}>
        Aktivitäten wie Laufen, Radfahren oder Schwimmen kannst du im Trainingsplan einplanen und am Trainingstag
        bestätigen.
      </p>
      {error && <div className="error">{error}</div>}
      {editing && (
        <ActivityForm
          key={editing === 'new' ? 'new' : editing.id}
          activity={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(a) => {
            setItems((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]));
            setEditing(null);
          }}
        />
      )}
      <div className="list">
        {items.map((a) => (
          <div key={a.id} className="list-item">
            <span style={{ fontSize: '1.6rem' }}>{a.icon}</span>
            <div className="li-main li-title">{a.name}</div>
            <button type="button" className="small" onClick={() => setEditing(a)}>
              Bearbeiten
            </button>
            <button type="button" className="icon small ghost" aria-label="Löschen" onClick={() => setToDelete(a)}>
              🗑
            </button>
          </div>
        ))}
      </div>
      {toDelete && (
        <ConfirmDialog
          title="Aktivität löschen?"
          text={`„${toDelete.name}“ wird gelöscht. Der Verlauf bleibt erhalten.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const target = toDelete;
            setToDelete(null);
            try {
              await api.del(`/api/activity-types/${target.id}`);
              setItems((list) => list.filter((x) => x.id !== target.id));
              setError(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

export function ActivityForm({
  activity,
  onSaved,
  onCancel,
}: {
  activity: ActivityType | null;
  onSaved: (a: ActivityType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(activity?.name ?? '');
  const [icon, setIcon] = useState(activity?.icon ?? '🏃');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const body = { name, icon };
      onSaved(
        activity
          ? await api.put<ActivityType>(`/api/activity-types/${activity.id}`, body)
          : await api.post<ActivityType>('/api/activity-types', body),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 14 }}>
      {error && <div className="error">{error}</div>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="z. B. Radfahren" />
      </label>
      <div className="muted small-text" style={{ marginBottom: 6 }}>
        Symbol
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            className={`icon small ${icon === i ? 'primary' : ''}`}
            style={{ fontSize: '1.2rem' }}
            onClick={() => setIcon(i)}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="row end">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="primary">
          Speichern
        </button>
      </div>
    </form>
  );
}
