import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import LoadingSpinner from './components/LoadingSpinner';
import Dashboard from './pages/Dashboard';
import Tracker from './pages/Tracker';
import Logger from './pages/Logger';
import Progress from './pages/Progress';
import Analytics from './pages/Analytics';
import History from './pages/History';
import Program from './pages/Program';
import Settings from './pages/Settings';
import Achievements from './pages/Achievements';
import Login from './pages/Login';
import Register from './pages/Register';
import Cardio from './pages/Cardio';
import Friends from './pages/Friends';
import Compare from './pages/Compare';
import Medals from './pages/Medals';
import Profile from './pages/Profile';
import Chat from './pages/Chat';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tracker" element={<Tracker />} />
                <Route path="/log" element={<Logger />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/history" element={<History />} />
                <Route path="/program" element={<Program />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/cardio" element={<Cardio />} />
                <Route path="/friends" element={<Friends />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/medals" element={<Medals />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </AppProvider>
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
