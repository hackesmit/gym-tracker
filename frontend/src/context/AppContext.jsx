import { createContext, useContext, useState, useEffect } from 'react';
import { getPrograms } from '../api/client';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  // LOTR theme — single realm-based dark theme (no light mode)
  const theme = 'gondor';

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
      theme,
      units, setUnits, convert, unitLabel,
      defaultRestSeconds, setDefaultRestSeconds,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
