import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import { useT } from '../i18n';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username.trim(), password, remember);
      navigate('/', { replace: true });
    } catch (ex) {
      setErr(ex.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-dark">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-center mb-6 text-text">
          Gym Tracker
        </h1>
        <Card title={t('login.title', 'Sign in')}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('login.username', 'Username')}</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.username', 'username')}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('login.password', 'Password')}</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-text-muted select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t('login.remember', 'Remember me')}
            </label>
            {err && (
              <p className="text-sm text-danger">{err}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-accent text-surface-dark text-sm font-semibold hover:bg-accent-light transition-colors disabled:opacity-60"
            >
              {busy ? '…' : t('login.submit', 'Sign in')}
            </button>
          </form>
          <p className="text-xs text-text-muted mt-4 text-center">
            {t('login.noAccount', 'No account?')}{' '}
            <Link to="/register" className="text-accent hover:underline">{t('login.create', 'Register')}</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
