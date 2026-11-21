import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { Thumb } from '../components/Thumb';

interface Base {
  id: number;
  name: string;
  image: string | null;
}

/**
 * Gemeinsames Gerüst für „Übungen verwalten“ und „Stretching-Übungen verwalten“:
 * PC: Liste links, Details rechts. Smartphone: Liste oder Details.
 */
export function ManageList<T extends Base>({
  title,
  endpoint,
  icon,
  emptyText,
  subtitle,
  renderForm,
}: {
  title: string;
  endpoint: string;
  icon: string;
  emptyText: string;
  subtitle: (item: T) => ReactNode;
  renderForm: (props: {
    item: T | null;
    onSaved: (item: T) => void;
    onCancel: () => void;
    onDelete?: () => void;
  }) => ReactNode;
}) {
  const [items, setItems] = useState<T[] | null>(null);
  const [selected, setSelected] = useState<number | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<T[]>(endpoint)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [endpoint]);

  const current = typeof selected === 'number' ? (items?.find((i) => i.id === selected) ?? null) : null;
  const showEditor = selected !== null;
  const filtered = items?.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  const sortByName = (list: T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <>
      <div className="section-title">
        <h1 style={{ margin: 0 }}>{title}</h1>
        <button className="primary small" onClick={() => setSelected('new')}>
          + Neu
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="split">
        <div className={`sticky-col ${showEditor ? 'desktop-only' : ''}`}>
          {items && items.length > 6 && (
            <input
              type="search"
              placeholder="Suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10, marginTop: 0 }}
            />
          )}
          {items?.length === 0 && <div className="empty">{emptyText}</div>}
          <div className="list">
            {filtered.map((it) => (
              <div
                key={it.id}
                className={`list-item clickable ${selected === it.id ? 'selected' : ''}`}
                onClick={() => setSelected(it.id)}
              >
                <Thumb image={it.image} icon={icon} />
                <div className="li-main">
                  <div className="li-title">{it.name}</div>
                  <div className="li-sub">{subtitle(it)}</div>
                </div>
                <span className="muted">›</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          {showEditor ? (
            <div className="card">
              <div className="row" style={{ marginBottom: 8 }}>
                <button className="ghost small mobile-only" onClick={() => setSelected(null)}>
                  ‹ Zurück
                </button>
                <h2 style={{ margin: 0 }}>{current ? current.name : 'Neu anlegen'}</h2>
              </div>
              {renderForm({
                // key sorgt dafür, dass das Formular bei Auswahlwechsel neu startet
                item: current,
                onSaved: (saved) => {
                  setItems((list) => sortByName([...(list ?? []).filter((i) => i.id !== saved.id), saved]));
                  setSelected(saved.id);
                },
                onCancel: () => setSelected(null),
                onDelete: current ? () => setConfirmDelete(current) : undefined,
              })}
            </div>
          ) : (
            <div className="empty desktop-only">Wähle links einen Eintrag aus oder lege einen neuen an.</div>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Wirklich löschen?"
          text={`„${confirmDelete.name}“ wird gelöscht.`}
          confirmLabel="Löschen"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete;
            setConfirmDelete(null);
            try {
              await api.del(`${endpoint}/${target.id}`);
              setItems((list) => list?.filter((i) => i.id !== target.id) ?? null);
              setSelected(null);
              setError(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      )}
    </>
  );
}
