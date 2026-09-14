import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api/client';
import logo from '../assets/azul-tech-logo-white-transparent.png';
import { MailIcon, LockIcon } from '../components/Icons';

// Shown for ?sso_error=<code> on the way back from a failed/aborted SSO
// attempt (server/src/routes/auth.js redirects here with one of these).
const SSO_ERROR_MESSAGES = {
  disabled: 'Your HRM login has been disabled. Contact your Admin.',
  not_verified: 'Finish verifying your email in Azul Tech Single Sign-On, then try again.',
  expired: 'That sign-in attempt expired. Please try "Continue with Azul Tech SSO" again.',
  failed: 'Azul Tech SSO sign-in failed. Please try again.',
  unavailable: 'Azul Tech SSO is temporarily unavailable. Please try again shortly, or sign in with your password.',
  no_email: "Your Azul Tech account doesn't have an email address Keycloak can share. Ask your Admin for help.",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgotNote, setShowForgotNote] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    api
      .get('/auth/sso/status')
      .then((s) => setSsoEnabled(!!s.enabled))
      .catch(() => setSsoEnabled(false));

    const ssoError = searchParams.get('sso_error');
    if (ssoError) setError(SSO_ERROR_MESSAGES[ssoError] || 'Azul Tech SSO sign-in failed. Please try again.');
    // Only read sso_error once, on the redirect back from /sso/callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ssoLogin() {
    // Full page navigation, not a fetch — Keycloak's login page (and this
    // redirect back) only work as real top-level browser navigations.
    window.location.href = '/api/auth/sso/login';
  }

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

        {ssoEnabled && (
          <>
            <div className="login-divider">
              <span>or</span>
            </div>
            <button type="button" className="pill-submit-outline" onClick={ssoLogin}>
              Continue with Azul Tech SSO
            </button>
          </>
        )}
      </form>
    </div>
  );
}
