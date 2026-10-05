const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const { generators } = require('openid-client');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptBuffer, decryptBuffer } = require('../lib/crypto');
const { writeAuditLog } = require('../lib/audit');
const { ssoEnabled, getClient, getRedirectUris, getPrimaryRedirectUri } = require('../lib/keycloakClient');
const {
  extractGroupsFromClaims,
  resolveSsoRoleFromGroups,
  applyManagerEmails,
  DEFAULT_SSO_ROLE,
} = require('../lib/ssoRoleMap');

const router = express.Router();
const storageDir = path.join(__dirname, '..', '..', 'storage');
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

// Email/password login is the local-dev sign-in method. In production (SSO
// configured via KEYCLOAK_* env vars) this route is intentionally disabled
// and the UI only offers "Continue with Azul Tech SSO" — SSO is the only
// production sign-in. Locally, leave the KEYCLOAK_* vars blank in
// server/.env to disable SSO; then this route (and the password form in
// Login.jsx) is active again so you can test without Keycloak running.
router.post('/login', loginLimiter, (req, res) => {
  if (ssoEnabled()) {
    return res.status(410).json({
      error: 'This sign-in method is no longer available. Please use Continue with Azul Tech SSO.',
    });
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });
  const { email, password, remember } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    writeAuditLog(user?.id ?? null, 'login_failed', 'user', user?.id ?? null, { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // "Remember me" extends the session from 12 hours to 30 days.
  setSessionCookie(res, user, { remember, req });

  writeAuditLog(user.id, 'login_success', 'user', user.id);
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    has_photo: !!user.photo_stored_filename,
  });
});

// --- Azul Tech SSO ("Continue with Azul Tech SSO") -----------------------
//
// SSO only ever signs a person into an HRM login that already exists,
// matched by email — it never creates one. Every account (Admin, HR, or
// Employee) is still created deliberately by an Admin in User Accounts,
// exactly as before; SSO is just a second way to prove you are the person
// that account belongs to. Entirely optional: if Keycloak isn't configured
// (see server/.env.example), these two routes 404 and the login page shows
// only the password form.
//
// The exchange with Keycloak (authorization code + PKCE, confidential
// client secret) happens entirely server-side — the browser only ever sees
// two redirects, never a Keycloak token. On success we mint the exact same
// hrm_token cookie the password form does, so every other route in this app
// (requireAuth, requireRole, all the Admin/HR/Employee checks) needs no
// changes at all.
const SSO_STATE_COOKIE = 'hrm_sso_state';
const SSO_ID_TOKEN_COOKIE = 'hrm_sso_id_token';
const SSO_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function isHttps(req) {
  if (!req) return process.env.NODE_ENV === 'production';
  if (req.secure) return true;
  const proto = (req.get('X-Forwarded-Proto') || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function sessionCookieOptions(maxAge, req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Secure only on real HTTPS — a blanket NODE_ENV check breaks local
    // docker testing on http://localhost:4000 because browsers reject Secure
    // cookies over HTTP (state + session cookies silently vanish).
    secure: isHttps(req),
    maxAge,
    path: '/',
  };
}

function encodeIdToken(idToken) {
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(idToken, 'utf8'));
  return Buffer.from(JSON.stringify({ ciphertext: ciphertext.toString('base64'), iv, authTag })).toString('base64url');
}

function decodeIdToken(value) {
  try {
    const { ciphertext, iv, authTag } = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return decryptBuffer(Buffer.from(ciphertext, 'base64'), iv, authTag).toString('utf8');
  } catch {
    return null;
  }
}

function postLogoutRedirectUri(req) {
  const configured = (process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (req && configured.length > 1) {
    const hint = req.get('Referer') || req.get('Origin') || '';
    const match = configured.find((u) => {
      try {
        return hint.startsWith(new URL(u).origin);
      } catch {
        return false;
      }
    });
    if (match) return match;
  }
  return configured[0] || new URL('/login', getPrimaryRedirectUri()).toString();
}

// Picks which registered redirect URI to use for THIS login request, so
// `npm run dev` (browser on :5173) and `docker compose up` (browser on :4000)
// both work with one .env. Matches the request's page origin against the
// allowlisted KEYCLOAK_REDIRECT_URI entries — never trusts an arbitrary
// caller-supplied URL, so no open-redirect is possible.
function pickRedirectUri(req) {
  const allowlist = getRedirectUris();
  const hint = req.get('Referer') || req.get('Origin') || '';
  const match = allowlist.find((u) => {
    try {
      return hint.startsWith(new URL(u).origin);
    } catch {
      return false;
    }
  });
  return match || getPrimaryRedirectUri();
}

// Where the browser should land after the callback. In dev the Keycloak
// redirect comes back to the Vite origin (:5173, via proxy), so send the
// browser there — a bare '/' would drop it on :4000 which serves no UI in dev.
function appOriginForRedirectUri(redirectUri) {
  try {
    return new URL(redirectUri).origin;
  } catch {
    return '';
  }
}

// Comma-separated emails that should start as (or be promoted to) 'admin'
// the moment they sign in via SSO, rather than the default 'employee' —
// same name and semantics as Lunchify's BOOTSTRAP_ADMIN_EMAILS (see that
// repo's README): only ever promotes, never demotes, and only takes effect
// on login, so leaving it set is harmless — it's not a standing override.
function isBootstrapAdmin(email) {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

function setSessionCookie(res, user, { remember = false, req = null } = {}) {
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: remember ? '30d' : '12h',
  });
  res.cookie('hrm_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    maxAge,
  });
}

router.get('/sso/status', (req, res) => {
  res.json({ enabled: ssoEnabled() });
});

router.get('/sso/login', async (req, res) => {
  if (!ssoEnabled()) return res.status(404).json({ error: 'SSO is not configured' });

  let client;
  try {
    client = await getClient();
  } catch {
    return res.status(503).send('Could not reach the SSO server. Please try again shortly.');
  }

  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);
  const state = generators.state();

  // Use the redirect URI matching this browser's origin (:5173 in dev,
  // :4000 in docker/prod) — Keycloak demands an exact registered match.
  const redirect_uri = pickRedirectUri(req);
  const authUrl = client.authorizationUrl({
    redirect_uri,
    scope: 'openid email profile',
    code_challenge,
    code_challenge_method: 'S256',
    state,
  });

  // Short-lived, tamper-proof (signed with the same JWT_SECRET as sessions)
  // cookie to carry the PKCE verifier + state + chosen redirect URI across
  // the redirect to Keycloak and back — never trust query params alone.
  const pkce = jwt.sign({ state, code_verifier, redirect_uri }, process.env.JWT_SECRET, { expiresIn: '10m' });
  res.cookie(SSO_STATE_COOKIE, pkce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    maxAge: SSO_STATE_MAX_AGE_MS,
  });
  res.redirect(authUrl);
});

router.get('/sso/callback', async (req, res) => {
  if (!ssoEnabled()) return res.status(404).send('SSO is not configured');

  const raw = req.cookies?.[SSO_STATE_COOKIE];
  res.clearCookie(SSO_STATE_COOKIE);
  if (!raw) return res.redirect('/login?sso_error=expired');

  let pkce;
  try {
    pkce = jwt.verify(raw, process.env.JWT_SECRET);
  } catch {
    return res.redirect('/login?sso_error=expired');
  }

  let client;
  try {
    client = await getClient();
  } catch {
    return res.redirect('/login?sso_error=unavailable');
  }

  let tokenSet;
  try {
    const params = client.callbackParams(req);
    // Must be byte-identical to the redirect_uri sent in /sso/login —
    // Keycloak and openid-client both reject anything else.
    const allowlist = getRedirectUris();
    const redirectUri =
      pkce.redirect_uri && allowlist.includes(pkce.redirect_uri) ? pkce.redirect_uri : getPrimaryRedirectUri();
    // client.callback() verifies the authorization code, the state, and the
    // ID token's signature/issuer/audience/expiry against Keycloak's JWKS —
    // this throws on any mismatch, so a forged or replayed callback fails here.
    tokenSet = await client.callback(redirectUri, params, {
      state: pkce.state,
      code_verifier: pkce.code_verifier,
    });
  } catch (err) {
    console.error('SSO callback failed:', err.message);
    return res.redirect('/login?sso_error=failed');
  }

  const claims = tokenSet.claims();
  const email = (claims.email || '').toLowerCase();
  const groups = extractGroupsFromClaims(claims);
  const mappedRole = resolveSsoRoleFromGroups(groups);
  console.info('[sso-role-map]', JSON.stringify({
    email,
    groups,
    mappedRole,
    defaultRole: DEFAULT_SSO_ROLE,
    claimsKeys: Object.keys(claims || {}),
  }));

  if (!email) return res.redirect('/login?sso_error=no_email');

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // An Admin deliberately disabling a login must still be respected — SSO
  // never reactivates one.
  if (user && !user.active) {
    writeAuditLog(user.id, 'login_failed_sso', 'user', user.id, { email, reason: 'disabled' });
    return res.redirect('/login?sso_error=disabled');
  }

  if (!user) {
    // First time this person has used SSO and there's no HRM login yet.
    // Auto-provision them — 'admin' if they're on BOOTSTRAP_ADMIN_EMAILS
    // (a named, deliberately-configured list — not something SSO decides on
    // its own), 'employee' otherwise, never 'hr' (there's no bootstrap path
    // to HR; that tier is always a manual promotion in User Accounts). This
    // just removes the need for HR to pre-create a login for every single
    // person before they can see their own basic profile, which is all an
    // Employee login is for anyway (see README "Access model").
    //
    // Gated on the account having actually finished onboarding in Keycloak
    // (a verified email) — a Keycloak account that's still mid-setup
    // doesn't get an HRM login yet either.
    if (!claims.email_verified) {
      return res.redirect('/login?sso_error=not_verified');
    }

    const name =
      (claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email).slice(0, 200);
    // No one ever sees or uses this password — the account only ever signs
    // in through SSO — so it's a random value satisfying the NOT NULL
    // column, not a credential anyone needs to know.
    const password_hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
    const baseRole = applyManagerEmails(mappedRole || DEFAULT_SSO_ROLE, email);
    const role = isBootstrapAdmin(email) ? 'admin' : baseRole;
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, password_hash, role);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    writeAuditLog(user.id, 'user_created_via_sso', 'user', user.id, { email, role, groups, mappedRole });
  } else {
    const nextRole = isBootstrapAdmin(email) ? 'admin' : applyManagerEmails(mappedRole || DEFAULT_SSO_ROLE, email);
    if (user.role !== nextRole) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(nextRole, user.id);
      writeAuditLog(user.id, 'user_role_synced_via_sso', 'user', user.id, {
        email,
        previousRole: user.role,
        nextRole,
        groups,
        mappedRole,
      });
      user.role = nextRole;
    }
  }

  setSessionCookie(res, user, { req });
  if (tokenSet.id_token) {
    res.cookie(SSO_ID_TOKEN_COOKIE, encodeIdToken(tokenSet.id_token), sessionCookieOptions(12 * 60 * 60 * 1000, req));
  }
  writeAuditLog(user.id, 'login_success_sso', 'user', user.id);
  // Land back on the frontend origin the login started from (:5173 in dev
  // via the Vite proxy, :4000 in docker/prod where the API serves the UI).
  const allowlist = getRedirectUris();
  const usedRedirect = pkce.redirect_uri && allowlist.includes(pkce.redirect_uri) ? pkce.redirect_uri : null;
  const appOrigin = usedRedirect ? appOriginForRedirectUri(usedRedirect) : '';
  res.redirect(appOrigin && !appOrigin.endsWith(':4000') ? `${appOrigin}/` : '/');
});

router.post('/logout', async (req, res) => {
  if (req.user) writeAuditLog(req.user.id, 'logout', 'user', req.user.id);

  const idToken = req.cookies?.[SSO_ID_TOKEN_COOKIE] ? decodeIdToken(req.cookies[SSO_ID_TOKEN_COOKIE]) : null;
  res.clearCookie('hrm_token', { path: '/' });
  res.clearCookie(SSO_ID_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(SSO_STATE_COOKIE, { path: '/' });

  if (!ssoEnabled()) return res.json({ ok: true, logoutUrl: '/login' });

  try {
    const client = await getClient();
    const logoutUrl = client.endSessionUrl({
      ...(idToken ? { id_token_hint: idToken } : {}),
      client_id: process.env.KEYCLOAK_CLIENT_ID,
      post_logout_redirect_uri: postLogoutRedirectUri(req),
    });
    return res.json({ ok: true, logoutUrl });
  } catch (err) {
    console.error('SSO logout URL creation failed:', err.message);
    return res.status(503).json({ error: 'Could not complete SSO logout. Please try again.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// Self-service password change — any logged-in user (Admin, HR, or Employee)
// can change their own password once they know their current one.
// Disabled in production when SSO is configured (passwords live in the
// identity provider there); enabled locally when SSO is off.
router.patch('/password', requireAuth, changePasswordLimiter, (req, res) => {
  if (ssoEnabled()) {
    return res.status(410).json({
      error: 'Password changes are disabled. Please use Azul Tech SSO to sign in and manage access in the identity provider.',
    });
  }
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { currentPassword, newPassword } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const password_hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);

  writeAuditLog(req.user.id, 'password_changed', 'user', req.user.id);
  res.json({ ok: true });
});

// Account photo, shown in the header avatar - available to any logged-in
// user (Admin, HR, or Employee) for their OWN login, regardless of whether
// they have a linked employee record. This is separate from the
// employee-record photo (server/src/routes/employees.js), which is about
// the staff roster entry Admin/HR see in the Employees list.
router.post('/photo', requireAuth, uploadPhoto.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  if (!ALLOWED_PHOTO_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Photo must be a JPEG, PNG, WEBP, or GIF image' });
  }

  const existing = db.prepare('SELECT photo_stored_filename FROM users WHERE id = ?').get(req.user.id);
  if (existing?.photo_stored_filename) {
    const oldPath = path.join(storageDir, existing.photo_stored_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const { ciphertext, iv, authTag } = encryptBuffer(req.file.buffer);
  const storedFilename = crypto.randomUUID();
  fs.writeFileSync(path.join(storageDir, storedFilename), ciphertext);

  db.prepare(
    `UPDATE users SET photo_stored_filename = ?, photo_mime_type = ?, photo_iv = ?, photo_auth_tag = ? WHERE id = ?`
  ).run(storedFilename, req.file.mimetype, iv, authTag, req.user.id);

  writeAuditLog(req.user.id, 'account_photo_updated', 'user', req.user.id);
  res.json({ ok: true, has_photo: true });
});

router.get('/photo', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user?.photo_stored_filename) return res.status(404).end();

  const ciphertext = fs.readFileSync(path.join(storageDir, user.photo_stored_filename));
  const plain = decryptBuffer(ciphertext, user.photo_iv, user.photo_auth_tag);
  res.setHeader('Content-Type', user.photo_mime_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(plain);
});

router.delete('/photo', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT photo_stored_filename FROM users WHERE id = ?').get(req.user.id);
  if (existing?.photo_stored_filename) {
    const oldPath = path.join(storageDir, existing.photo_stored_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare(
    `UPDATE users SET photo_stored_filename = NULL, photo_mime_type = NULL, photo_iv = NULL, photo_auth_tag = NULL WHERE id = ?`
  ).run(req.user.id);

  writeAuditLog(req.user.id, 'account_photo_removed', 'user', req.user.id);
  res.json({ ok: true, has_photo: false });
});

module.exports = router;
