import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logo from '../assets/azul-tech-logo-white-transparent.png';
import { MailIcon, LockIcon } from '../components/Icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgotNote, setShowForgotNote] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password, remember);
      navigate(user.role === 'employee' ? '/employee-dashboard' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-page-bg" aria-hidden="true" />
      <div className="login-corner-brand">
        <span className="brand-logo-chip">
          <img src={logo} alt="Azul Tech" />
        </span>
        <span className="brand-suffix">People</span>
      </div>

      <form className="login-glass-card" onSubmit={handleSubmit}>
        <div className="login-glass-heading">
          <span className="brand-logo-chip brand-logo-chip-lg">
            <img src={logo} alt="Azul Tech" />
          </span>
          <p className="subtitle">People Management System</p>
        </div>

        {error && <div className="error-banner error-banner-dark">{error}</div>}

        <div className="pill-input">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <span className="pill-input-icon">
            <MailIcon />
          </span>
        </div>

        <div className="pill-input">
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <span className="pill-input-icon">
            <LockIcon />
          </span>
        </div>

        <div className="login-options-row">
          <label className="remember-checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowForgotNote((s) => !s)}
          >
            Forgot password?
          </button>
        </div>
        {showForgotNote && (
          <p className="forgot-note">Ask your Admin to reset it for you from User Accounts.</p>
        )}

        <button type="submit" className="pill-submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
