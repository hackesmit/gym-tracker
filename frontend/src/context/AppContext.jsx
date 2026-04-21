import { createContext, useContext, useState, useEffect } from 'react';
import { getPrograms } from '../api/client';
import { useAuth } from './AuthContext';
import { kgToDisplay, getUnitLabel } from '../utils/units';

const AppContext = createContext();

export function AppProvider({ children }) {
  const { user, loading: authLoading } = useAuth() || {};
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);

  // Theme mode: 'neutral' (default) or 'lotr'
  const [themeMode, setThemeModeState] = useState(() => localStorage.getItem('gym-theme-mode') || 'neutral');

  // LOTR realm themes
  const REALMS = ['gondor', 'rohan', 'rivendell', 'mordor', 'shire'];
  const [realm, setRealmState] = useState(() => localStorage.getItem('gym-realm') || 'gondor');

  const applyTheme = (mode, r) => {
    if (mode === 'lotr') {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.setAttribute('data-realm', r);
    } else {
      document.documentElement.removeAttribute('data-realm');
      document.documentElement.setAttribute('data-theme', 'neutral');
    }
  };

  const setThemeMode = (val) => {
    setThemeModeState(val);
    localStorage.setItem('gym-theme-mode', val);
    applyTheme(val, realm);
  };

  const setRealm = (val) => {
    setRealmState(val);
    localStorage.setItem('gym-realm', val);
    if (themeMode === 'lotr') applyTheme('lotr', val);
  };
  const cycleRealm = () => {
    const idx = REALMS.indexOf(realm);
    setRealm(REALMS[(idx + 1) % REALMS.length]);
  };

  // Apply on mount
  useEffect(() => {
    applyTheme(themeMode, realm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = realm;

  const [units, setUnitsState] = useState(() => localStorage.getItem('gym-units') || 'lbs');
  const setUnits = (val) => {
    setUnitsState(val);
    localStorage.setItem('gym-units', val);
  };

  const [defaultRestSeconds, setDefaultRestSecondsState] = useState(() => parseInt(localStorage.getItem('gym-rest-seconds') || '90', 10));
  const setDefaultRestSeconds = (val) => {
    setDefaultRestSecondsState(val);
    localStorage.setItem('gym-rest-seconds', String(val));
  };

  // Language: 'en' (default) or 'es'
  const [language, setLanguageState] = useState(() => localStorage.getItem('gym-lang') || 'en');
  const setLanguage = (val) => {
    setLanguageState(val);
    localStorage.setItem('gym-lang', val);
    try { document.documentElement.setAttribute('lang', val); } catch { /* ignore */ }
  };
  useEffect(() => {
    try { document.documentElement.setAttribute('lang', language); } catch { /* ignore */ }
  }, [language]);

  const convert = (kg) => {
    if (kg == null) return 0;
    return kgToDisplay(kg, units);
  };
  const unitLabel = getUnitLabel(units);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPrograms([]);
      setActiveProgram(null);
      return;
    }
    getPrograms().then((res) => {
      const list = res.programs || [];
      setPrograms(list);
      const active = list.find((p) => p.status === 'active');
      if (active) setActiveProgram(active);
      else if (list.length) setActiveProgram(list[0]);
    }).catch(() => {});
  }, [user, authLoading]);

  const refreshPrograms = async () => {
    const res = await getPrograms();
    const list = res.programs || [];
    setPrograms(list);
    const active = list.find((p) => p.status === 'active');
    if (active) setActiveProgram(active);
    else if (list.length) setActiveProgram(list[0]);
  };

  return (
    <AppContext.Provider value={{
      programs, activeProgram, setActiveProgram, refreshPrograms,
      themeMode, setThemeMode,
      theme, realm, setRealm, cycleRealm, REALMS,
      units, setUnits, convert, unitLabel,
      defaultRestSeconds, setDefaultRestSeconds,
      language, setLanguage,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
