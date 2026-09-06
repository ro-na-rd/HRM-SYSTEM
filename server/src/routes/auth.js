const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();

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

router.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });
  const { email, password, remember } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    writeAuditLog(user?.id ?? null, 'login_failed', 'user', user?.id ?? null, { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // "Remember me" extends the session from 12 hours to 30 days.
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: remember ? '30d' : '12h',
  });
  res.cookie('hrm_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // requires HTTPS in production
    maxAge,
  });

  writeAuditLog(user.id, 'login_success', 'user', user.id);
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.post('/logout', requireAuth, (req, res) => {
  writeAuditLog(req.user.id, 'logout', 'user', req.user.id);
  res.clearCookie('hrm_token');
  res.json({ ok: true });
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
router.patch('/password', requireAuth, changePasswordLimiter, (req, res) => {
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

module.exports = router;
