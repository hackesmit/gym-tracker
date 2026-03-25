import { createContext, useContext, useState, useEffect } from 'react';
import { getPrograms } from '../api/client';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  // LOTR realm themes
  const REALMS = ['gondor', 'rohan', 'rivendell', 'mordor', 'shire'];
  const [realm, setRealmState] = useState(() => localStorage.getItem('gym-realm') || 'gondor');
  const setRealm = (val) => {
    setRealmState(val);
    localStorage.setItem('gym-realm', val);
    document.documentElement.setAttribute('data-realm', val);
  };
  const cycleRealm = () => {
    const idx = REALMS.indexOf(realm);
    setRealm(REALMS[(idx + 1) % REALMS.length]);
  };
  // Apply realm on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-realm', realm);
  }, []);
  // Keep backward compat — theme maps to realm
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

  const convert = (kg) => {
    if (kg == null) return 0;
    return units === 'lbs' ? +(kg * 2.20462).toFixed(1) : +kg.toFixed(1);
  };
  const unitLabel = units === 'lbs' ? 'lbs' : 'kg';

  useEffect(() => {
    getPrograms().then((res) => {
      const list = res.programs || [];
      setPrograms(list);
      const active = list.find((p) => p.status === 'active');
      if (active) setActiveProgram(active);
      else if (list.length) setActiveProgram(list[0]);
    }).catch(() => {});
  }, []);

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
      theme, realm, setRealm, cycleRealm, REALMS,
      units, setUnits, convert, unitLabel,
      defaultRestSeconds, setDefaultRestSeconds,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
