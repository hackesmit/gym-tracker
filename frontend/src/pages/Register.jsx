import { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';

export default function Register() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await register(username.trim(), password, email.trim() || undefined);
      navigate('/', { replace: true });
    } catch (ex) {
      setErr(ex.message || 'Registration failed');
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
        <Card title="Create account">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Username</label>
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
              <label className="block text-xs text-text-muted mb-1">Password</label>
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
              <label className="block text-xs text-text-muted mb-1">Email (optional)</label>
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
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </form>
          <p className="text-xs text-text-muted mt-4 text-center">
            Already have an account? <Link to="/login" className="text-accent hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
