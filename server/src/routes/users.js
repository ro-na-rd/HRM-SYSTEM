const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, active, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json(users);
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'hr', 'manager', 'employee']),
});

router.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, email, password, role } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

  const password_hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.toLowerCase(), password_hash, role);

  writeAuditLog(req.user.id, 'user_created', 'user', info.lastInsertRowid, { email, role });
  res.status(201).json({ id: info.lastInsertRowid, name, email, role, active: 1 });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'hr', 'manager', 'employee']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (id === req.user.id && parsed.data.active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const next = {
    name: parsed.data.name ?? user.name,
    role: parsed.data.role ?? user.role,
    active: parsed.data.active === undefined ? user.active : parsed.data.active ? 1 : 0,
    password_hash: parsed.data.password ? bcrypt.hashSync(parsed.data.password, 12) : user.password_hash,
  };

  db.prepare('UPDATE users SET name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?').run(
    next.name,
    next.role,
    next.active,
    next.password_hash,
    id
  );

  writeAuditLog(req.user.id, 'user_updated', 'user', id, { fields: Object.keys(parsed.data) });
  res.json({ id, name: next.name, email: user.email, role: next.role, active: next.active });
});

module.exports = router;
