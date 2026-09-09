const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { encryptBuffer, decryptBuffer } = require('../lib/crypto');
const { writeAuditLog } = require('../lib/audit');

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
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    has_photo: !!user.photo_stored_filename,
  });
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
