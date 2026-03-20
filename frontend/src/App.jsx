import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Tracker from './pages/Tracker';
import Logger from './pages/Logger';
import Progress from './pages/Progress';
import Analytics from './pages/Analytics';
import Recovery from './pages/Recovery';
import History from './pages/History';
import Program from './pages/Program';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/log" element={<Logger />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/history" element={<History />} />
          <Route path="/program" element={<Program />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
