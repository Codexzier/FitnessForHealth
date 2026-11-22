import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { applyTheme } from './theme';
import type { Profile } from './types';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  setUser: (u: Profile | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Profile>('/api/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('ffh:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ffh:unauthorized', onUnauthorized);
  }, []);

  // Theme des angemeldeten Benutzers; ohne Anmeldung das Standard-Theme
  useEffect(() => {
    if (!loading) applyTheme(user?.theme, user?.colorMode);
  }, [loading, user?.theme, user?.colorMode]);

  const logout = useCallback(async () => {
    await api.post('/api/logout').catch(() => undefined);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider fehlt');
  return ctx;
}
