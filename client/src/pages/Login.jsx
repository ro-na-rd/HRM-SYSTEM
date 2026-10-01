import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api/client';
import BrandLogo from '../components/BrandLogo';

// Shown for ?sso_error=<code> on the way back from a failed/aborted SSO
// attempt (server/src/routes/auth.js redirects here with one of these).
const SSO_ERROR_MESSAGES = {
  disabled: 'Your HRM login has been disabled. Contact your Admin.',
  not_verified: 'Finish verifying your email in Azul Tech Single Sign-On, then try again.',
  expired: 'That sign-in attempt expired. Please try "Continue with Azul Tech SSO" again.',
  failed: 'Azul Tech SSO sign-in failed. Please try again.',
  unavailable: 'Azul Tech SSO is temporarily unavailable. Please try again shortly.',
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
  const [ssoChecked, setSsoChecked] = useState(false);

  useEffect(() => {
    api
      .get('/auth/sso/status')
      .then((s) => setSsoEnabled(!!s.enabled))
      .catch(() => setSsoEnabled(false))
      .finally(() => setSsoChecked(true));

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
      if (ssoEnabled) {
        // Production: SSO-only, no password form is rendered in this mode —
        // this submit comes from the "Continue with Azul Tech SSO" button.
        window.location.href = '/api/auth/sso/login';
        return;
      }
      // Local dev (SSO not configured): plain email/password sign-in so you
      // can test without Keycloak running.
      const user = await login(email, password, remember);
      navigate(user.role === 'employee' ? '/employee-dashboard' : '/dashboard');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-visual" aria-label="People team collaborating">
        <img src="/brand-assets/happy%20people.jpg" alt="People team collaborating in an office" />
        <div className="login-visual-overlay" />
        <div className="login-visual-copy">
          <span className="login-eyebrow">Human Resource Management System</span>
          <h1>Great work starts with people.</h1>
          <p>Connect your teams, support your people, and keep every part of work moving.</p>
        </div>
      </div>

      <div className="login-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-glass-heading">
            <BrandLogo className="login-logo" />

            <p className="login-subtitle">Human Resource Management System</p>
            <h1 className="login-welcome">Welcome back</h1>
          </div>

          {error && <div className="error-banner error-banner-dark">{error}</div>}

          {!ssoChecked ? (
            <p className="login-account-copy">Checking sign-in options…</p>
          ) : ssoEnabled ? (
            <>
              <p className="login-footer">Secured with Azul Tech single sign-on</p>
              <p className="login-sso-note">Single sign-on only</p>

              <button type="submit" className="pill-submit" disabled={submitting}>
                {submitting ? 'Redirecting...' : 'Continue with Azul Tech SSO'}
              </button>

              <p className="login-account-copy">Sign in with your @azultech.rw Azul Tech account.</p>
            </>
          ) : (
            <>
              <p className="login-footer">Local development sign-in</p>

              <div className="pill-input">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="pill-input">
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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

              <p className="login-account-copy">
                SSO is off locally — configure Keycloak to enable “Continue with Azul Tech SSO”.
              </p>
            </>
          )}
          <div className="login-bottom-footer">
            <p className="login-copyright">© 2026 Azul Tech. All rights reserved.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
