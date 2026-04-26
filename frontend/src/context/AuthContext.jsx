import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { login as apiLogin, register as apiRegister, getMe, setToken, clearToken, getToken } from '../api/client';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTok] = useState(() => getToken());
  const [loading, setLoading] = useState(true);

  // Hydrate on mount
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const t = getToken();
      if (!t) {
        setLoading(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) setUser(me.user || me);
      } catch {
        if (!cancelled) {
          clearToken();
          setTok(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTok(null);
    setUser(null);
    // Use replace to avoid back-button returning to authed page
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }, []);

  // Listen for auth:logout events from API client (401)
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [logout]);

  const login = async (username, password, remember = true) => {
    const res = await apiLogin({ username, password, remember });
    setToken(res.access_token, remember);
    setTok(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const register = async (username, password, email) => {
    const res = await apiRegister({ username, password, email: email || undefined });
    setToken(res.access_token, true);
    setTok(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const refreshUser = async () => {
    try {
      const fresh = await getMe();
      setUser(fresh.user || fresh);
    } catch {
      // ignore — leave the existing user object intact
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser: setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
