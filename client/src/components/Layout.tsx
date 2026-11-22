import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setPlusOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!plusOpen) return;
    const close = (e: MouseEvent) => {
      if (!plusRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [plusOpen]);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const download = (url: string) => {
    setMenuOpen(false);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <header className="topbar">
        <button className="icon ghost" aria-label="Menü öffnen" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
        <div className="title" onClick={() => navigate('/app')} style={{ cursor: 'pointer' }}>
          FitnessForHealth
        </div>
        <span className="user">{user?.name}</span>
        {user && <Avatar name={user.name} image={user.avatar} size="sm" />}
        <div ref={plusRef} style={{ position: 'relative' }}>
          <button className="icon primary" aria-label="Neu anlegen" onClick={() => setPlusOpen((o) => !o)}>
            +
          </button>
          {plusOpen && (
            <div className="popover" role="menu">
              <button onClick={() => go('/app/workout/neu')}>🏋️ Neues Workout</button>
              <button onClick={() => go('/app/stretching/neu')}>🧘 Neues Stretching</button>
              <button onClick={() => go('/app/plan/neu')}>📅 Neuer Trainingsplan</button>
            </div>
          )}
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />
          <nav className="drawer" aria-label="Hauptmenü">
            <div className="drawer-head">Angemeldet als {user?.name}</div>
            <button onClick={() => go('/app')}>🏠 Übersicht</button>
            <button onClick={() => go('/app/plaene')}>📅 Trainingspläne</button>
            <button onClick={() => go('/app/verlauf')}>📈 Fitness-Verlauf</button>
            <hr />
            <button onClick={() => go('/app/uebungen')}>🏋️ Übungen verwalten</button>
            <button onClick={() => go('/app/stretching-uebungen')}>🧘 Stretching-Übungen verwalten</button>
            <hr />
            <button onClick={() => download('/api/export/plans')}>⬇️ Export Workouts &amp; Stretching</button>
            <button onClick={() => download('/api/export/progress')}>⬇️ Export Fortschritt</button>
            <button onClick={() => go('/app/import/plaene')}>⬆️ Import Workouts &amp; Stretching</button>
            <button onClick={() => go('/app/import/fortschritt')}>⬆️ Import Fortschritt</button>
            <hr />
            <button onClick={() => go('/app/einstellungen')}>⚙️ Einstellungen</button>
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              👤 Benutzer wechseln
            </button>
          </nav>
        </>
      )}

      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
