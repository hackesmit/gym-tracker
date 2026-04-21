import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import { useT } from '../i18n';

export default function Register() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password !== passwordConfirm) {
      setErr(t('register.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await register(username.trim(), password, email.trim() || undefined);
      navigate('/', { replace: true });
    } catch (ex) {
      setErr(ex.message || t('register.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-dark">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-center mb-6 text-text">
          {t('app.name.neutral')}
        </h1>
        <Card title={t('register.title')}>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('login.username')}</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
                required
                minLength={3}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('login.password')}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('register.confirmPassword')}</label>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={`w-full bg-surface-light border rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none ${
                  passwordConfirm && password !== passwordConfirm ? 'border-danger' : 'border-surface-lighter'
                }`}
                required
                minLength={6}
              />
              {passwordConfirm && password !== passwordConfirm && (
                <p className="text-xs text-danger mt-1">{t('register.passwordMismatch')}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">{t('register.email')}</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-light border border-surface-lighter rounded-lg px-3 py-2.5 text-sm text-text focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-accent text-surface-dark text-sm font-semibold hover:bg-accent-light transition-colors disabled:opacity-60"
            >
              {busy ? t('register.submitting') : t('register.submit')}
            </button>
          </form>
          <p className="text-xs text-text-muted mt-4 text-center">
            {t('register.haveAccount')} <Link to="/login" className="text-accent hover:underline">{t('register.signIn')}</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
