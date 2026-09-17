import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import logo from '../assets/azul-tech-logo-white-transparent.png';

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
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      if (!ssoEnabled) {
        throw new Error('SSO is not configured. Please contact your administrator.');
      }
      window.location.href = '/api/auth/sso/login';
    } catch (err) {
      setError(err.message);
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

        <div className="login-options-row" style={{ justifyContent: 'center' }}>
          <span className="subtitle" style={{ textAlign: 'center' }}>
            Single sign-on only
          </span>
        </div>

        <button type="submit" className="pill-submit" disabled={submitting}>
          {submitting ? 'Redirecting...' : 'Continue with Azul Tech SSO'}
        </button>

        {!ssoEnabled && (
          <div className="error-banner error-banner-dark">SSO is not configured. Please contact your administrator.</div>
        )}
      </form>
    </div>
  );
}
